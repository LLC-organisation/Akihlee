package com.akihlee.documents;

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Thin client for Twilio's WhatsApp API: downloading media attached to
 * inbound messages, and sending simple text replies.
 *
 * Inert until real credentials are configured (TWILIO_ACCOUNT_SID /
 * TWILIO_AUTH_TOKEN) — calls will fail and are logged, not thrown, wherever
 * failure shouldn't block the rest of the app.
 */
@Service
public class WhatsAppService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);

    private final RestTemplate restTemplate;
    private final String accountSid;
    private final String authToken;
    private final String fromWhatsAppNumber;

    public WhatsAppService(
            RestTemplateBuilder builder,
            @Value("${twilio.account-sid}") String accountSid,
            @Value("${twilio.auth-token}") String authToken,
            @Value("${twilio.whatsapp-number}") String fromWhatsAppNumber) {
        this.restTemplate = builder.build();
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.fromWhatsAppNumber = fromWhatsAppNumber;
        if (!accountSid.isBlank() && !authToken.isBlank()) {
            Twilio.init(accountSid, authToken);
        }
    }

    /**
     * Twilio media URLs (from an inbound webhook's MediaUrlN field) require
     * HTTP Basic Auth with the account credentials to fetch.
     */
    public byte[] downloadMedia(String mediaUrl) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBasicAuth(accountSid, authToken);
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        return restTemplate.exchange(mediaUrl, HttpMethod.GET, entity, byte[].class).getBody();
    }

    /**
     * Sent once, right after a tenant links a number from Settings. Unlike
     * the inbound-reply flow, this is business-initiated rather than a
     * response to something the user just sent — Twilio only allows
     * freeform text for that if the number has an active 24-hour session
     * (e.g. they recently joined the Sandbox or messaged us), otherwise it
     * rejects the send (error 63016) until an approved Content Template is
     * configured. sendMessage() already logs failures instead of throwing,
     * so a rejected welcome message won't break the connect flow — it just
     * silently won't arrive. Worth revisiting with a Content Template once
     * this is on a real WhatsApp Business sender.
     */
    public void sendWelcomeMessage(String toPhoneDigitsOnly, String businessName) {
        String displayNumber = fromWhatsAppNumber.replace("whatsapp:", "");
        String text = "Welcome to Akihlee, " + businessName + "! This WhatsApp number is now connected to your account. "
                + "Send a photo or PDF of a receipt or invoice to " + displayNumber + " any time and we'll process it automatically.";
        sendMessage(toPhoneDigitsOnly, text);
    }

    /**
     * Best-effort confirmation/error reply — failures are logged, not
     * thrown, since a failed reply shouldn't fail document ingestion. This
     * is a freeform reply within an existing conversation (the user just
     * messaged us), so it doesn't need an approved Content Template — those
     * are only required to message someone outside a 24-hour window.
     */
    public void sendMessage(String toPhoneDigitsOnly, String text) {
        try {
            Message.creator(
                    new PhoneNumber("whatsapp:+" + toPhoneDigitsOnly),
                    new PhoneNumber(fromWhatsAppNumber),
                    text)
                .create();
        } catch (Exception e) {
            log.warn("Failed to send WhatsApp reply to {}: {}", toPhoneDigitsOnly, e.getMessage());
        }
    }
}
