package com.akihlee.documents;

import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

/**
 * Receives inbound WhatsApp messages (Meta Cloud API webhook) and feeds any
 * attached receipt/invoice image or PDF into the same upload pipeline used
 * by the web app.
 *
 * Not yet testable end-to-end: needs a real WhatsApp Business Account,
 * access token, and a public HTTPS URL registered with Meta. Scaffolded now
 * so it's ready the moment those exist — see docs/integrations (TODO) or
 * ask for the setup checklist.
 */
@RestController
@RequestMapping("/api/v1/webhooks/whatsapp")
public class WhatsAppWebhookController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookController.class);

    private final String verifyToken;
    private final WhatsAppService whatsAppService;
    private final TenantRepository tenantRepository;
    private final DocumentService documentService;

    public WhatsAppWebhookController(
            @Value("${whatsapp.verify-token}") String verifyToken,
            WhatsAppService whatsAppService,
            TenantRepository tenantRepository,
            DocumentService documentService) {
        this.verifyToken = verifyToken;
        this.whatsAppService = whatsAppService;
        this.tenantRepository = tenantRepository;
        this.documentService = documentService;
    }

    /**
     * Meta calls this once, when you register the webhook URL in the Meta
     * Business dashboard, to prove you control the endpoint.
     */
    @GetMapping
    public ResponseEntity<String> verify(
            @RequestParam("hub.mode") String mode,
            @RequestParam("hub.verify_token") String token,
            @RequestParam("hub.challenge") String challenge) {
        if ("subscribe".equals(mode) && verifyToken.equals(token)) {
            return ResponseEntity.ok(challenge);
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /**
     * Always returns 200 quickly — Meta retries (and can eventually disable
     * the webhook) if it doesn't get a fast ack, so failures are logged
     * rather than surfaced as error responses.
     */
    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody JsonNode payload) {
        try {
            processPayload(payload);
        } catch (Exception e) {
            log.error("Failed to process WhatsApp webhook payload", e);
        }
        return ResponseEntity.ok().build();
    }

    private void processPayload(JsonNode payload) {
        for (JsonNode entry : payload.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                for (JsonNode message : change.path("value").path("messages")) {
                    handleMessage(message);
                }
            }
        }
    }

    private void handleMessage(JsonNode message) {
        String fromPhone = message.path("from").asText(null);
        if (fromPhone == null) {
            return;
        }

        Tenant tenant = tenantRepository.findByWhatsappPhoneNumber(fromPhone).orElse(null);
        if (tenant == null) {
            log.warn("Received WhatsApp message from unregistered number: {}", fromPhone);
            whatsAppService.sendMessage(fromPhone,
                    "This number isn't linked to an Akihlee account yet. Connect it from your dashboard Settings page first.");
            return;
        }

        String messageType = message.path("type").asText("");
        String mediaId = null;
        String mimeType = null;
        if ("image".equals(messageType)) {
            mediaId = message.path("image").path("id").asText(null);
            mimeType = message.path("image").path("mime_type").asText("image/jpeg");
        } else if ("document".equals(messageType)) {
            mediaId = message.path("document").path("id").asText(null);
            mimeType = message.path("document").path("mime_type").asText("application/pdf");
        }

        if (mediaId == null) {
            whatsAppService.sendMessage(fromPhone, "Please send a photo or PDF of your receipt or invoice.");
            return;
        }

        byte[] content = whatsAppService.downloadMedia(mediaId);
        String extension = mimeType.contains("pdf") ? "pdf" : "jpg";
        String filename = "whatsapp-" + Instant.now().toEpochMilli() + "." + extension;

        TenantContext.setCurrentTenantId(tenant.getId());
        try {
            documentService.uploadDocument(filename, content, mimeType);
            whatsAppService.sendMessage(fromPhone, "Got it! Processing your receipt now.");
        } finally {
            TenantContext.clear();
        }
    }
}
