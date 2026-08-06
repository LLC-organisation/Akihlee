package com.akihlee.documents;

import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import com.twilio.security.RequestValidator;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Receives inbound WhatsApp messages via Twilio's webhook (form-encoded
 * POST) and feeds any attached receipt/invoice image or PDF into the same
 * upload pipeline used by the web app.
 */
@RestController
@RequestMapping("/api/v1/webhooks/whatsapp")
public class WhatsAppWebhookController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookController.class);

    private final String authToken;
    private final boolean validationEnabled;
    private final WhatsAppService whatsAppService;
    private final TenantRepository tenantRepository;
    private final DocumentService documentService;

    public WhatsAppWebhookController(
            @Value("${twilio.auth-token}") String authToken,
            @Value("${twilio.webhook-validation-enabled}") boolean validationEnabled,
            WhatsAppService whatsAppService,
            TenantRepository tenantRepository,
            DocumentService documentService) {
        this.authToken = authToken;
        this.validationEnabled = validationEnabled;
        this.whatsAppService = whatsAppService;
        this.tenantRepository = tenantRepository;
        this.documentService = documentService;
    }

    /**
     * Twilio signs every webhook request with X-Twilio-Signature, computed
     * from the exact URL it called plus the sorted POST params — verifying
     * it stops anyone else from POSTing forged messages here. Requires
     * server.forward-headers-strategy=framework so the reconstructed URL's
     * scheme/host matches what Twilio actually called through Render's
     * proxy, not an internal http://localhost Spring would otherwise see.
     *
     * Always returns 200 quickly on processing failures — Twilio retries
     * (and can eventually disable the webhook) if it doesn't get a fast ack.
     */
    @PostMapping
    public ResponseEntity<Void> receive(HttpServletRequest request) {
        Map<String, String> params = flattenParams(request);

        if (validationEnabled && !signatureValid(request, params)) {
            log.warn("Rejected WhatsApp webhook with invalid Twilio signature");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            handleMessage(params);
        } catch (Exception e) {
            log.error("Failed to process WhatsApp webhook payload", e);
        }
        return ResponseEntity.ok().build();
    }

    private boolean signatureValid(HttpServletRequest request, Map<String, String> params) {
        String signature = request.getHeader("X-Twilio-Signature");
        if (signature == null) {
            return false;
        }
        return new RequestValidator(authToken).validate(request.getRequestURL().toString(), params, signature);
    }

    private static Map<String, String> flattenParams(HttpServletRequest request) {
        Map<String, String> params = new HashMap<>();
        request.getParameterMap().forEach((key, values) -> {
            if (values.length > 0) {
                params.put(key, values[0]);
            }
        });
        return params;
    }

    private void handleMessage(Map<String, String> params) {
        String fromRaw = params.get("From"); // e.g. "whatsapp:+254712345678"
        if (fromRaw == null) {
            return;
        }
        String fromPhone = fromRaw.replaceAll("[^0-9]", "");

        Tenant tenant = tenantRepository.findByWhatsappPhoneNumber(fromPhone).orElse(null);
        if (tenant == null) {
            log.warn("Received WhatsApp message from unregistered number: {}", fromPhone);
            whatsAppService.sendMessage(fromPhone,
                    "This number isn't linked to an Akihlee account yet. Connect it from your dashboard Settings page first.");
            return;
        }

        int numMedia = parseInt(params.get("NumMedia"));
        if (numMedia < 1) {
            whatsAppService.sendMessage(fromPhone, "Please send a photo or PDF of your receipt or invoice.");
            return;
        }

        String mediaUrl = params.get("MediaUrl0");
        String mimeType = params.getOrDefault("MediaContentType0", "image/jpeg");
        byte[] content = whatsAppService.downloadMedia(mediaUrl);
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

    private static int parseInt(String value) {
        try {
            return value == null ? 0 : Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
