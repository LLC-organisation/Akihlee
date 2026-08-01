package com.akihlee.documents;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Thin client for the WhatsApp Business Cloud API: downloading media
 * attached to inbound messages, and sending simple text replies.
 *
 * Inert until real credentials are configured (WHATSAPP_ACCESS_TOKEN /
 * WHATSAPP_PHONE_NUMBER_ID) — calls will fail and are logged, not thrown,
 * wherever failure shouldn't block the rest of the app.
 */
@Service
public class WhatsAppService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);

    private final RestTemplate restTemplate;
    private final String accessToken;
    private final String phoneNumberId;
    private final String apiUrl;

    public WhatsAppService(
            RestTemplateBuilder builder,
            @Value("${whatsapp.access-token}") String accessToken,
            @Value("${whatsapp.phone-number-id}") String phoneNumberId,
            @Value("${whatsapp.api-url}") String apiUrl) {
        this.restTemplate = builder.build();
        this.accessToken = accessToken;
        this.phoneNumberId = phoneNumberId;
        this.apiUrl = apiUrl;
    }

    /**
     * Resolves a media ID to a temporary URL, then downloads the bytes.
     * Two calls, per the WhatsApp Cloud API's media retrieval flow.
     */
    public byte[] downloadMedia(String mediaId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<JsonNode> metadata = restTemplate.exchange(
                apiUrl + "/" + mediaId, HttpMethod.GET, entity, JsonNode.class);
        String mediaUrl = metadata.getBody().path("url").asText();

        ResponseEntity<byte[]> media = restTemplate.exchange(
                mediaUrl, HttpMethod.GET, entity, byte[].class);
        return media.getBody();
    }

    /**
     * Best-effort confirmation/error reply — failures are logged, not
     * thrown, since a failed reply shouldn't fail document ingestion.
     */
    public void sendMessage(String toPhoneNumber, String text) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body = Map.of(
                    "messaging_product", "whatsapp",
                    "to", toPhoneNumber,
                    "type", "text",
                    "text", Map.of("body", text));

            restTemplate.postForEntity(
                    apiUrl + "/" + phoneNumberId + "/messages",
                    new HttpEntity<>(body, headers),
                    String.class);
        } catch (Exception e) {
            log.warn("Failed to send WhatsApp reply to {}: {}", toPhoneNumber, e.getMessage());
        }
    }
}
