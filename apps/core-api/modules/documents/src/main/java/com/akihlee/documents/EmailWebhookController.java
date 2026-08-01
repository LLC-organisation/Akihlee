package com.akihlee.documents;

import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Receives inbound receipt/invoice emails via a provider's inbound-parse
 * webhook (e.g. SendGrid Inbound Parse, which POSTs the message as
 * multipart/form-data with attachments as file parts — the same shape
 * DocumentController's own upload endpoint already expects).
 *
 * Each tenant gets a dedicated address of the form
 * "{tenantId}@{email.inbound-domain}" (see TenantController's
 * inboundEmailAddress) — the tenant is resolved by extracting that UUID
 * from the "to" field, not from any sender identity, since anyone forwards
 * mail to their own dedicated address.
 *
 * Not yet testable end-to-end: needs a real inbound-email provider account
 * and MX records pointed at it for a domain/subdomain you control.
 */
@RestController
@RequestMapping("/api/v1/webhooks/email")
public class EmailWebhookController {

    private static final Logger log = LoggerFactory.getLogger(EmailWebhookController.class);

    private static final Pattern TENANT_ID_PATTERN =
            Pattern.compile("([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");
    private static final Set<String> ALLOWED_CONTENT_TYPES =
            Set.of("image/png", "image/jpeg", "image/jpg", "application/pdf");

    private final String webhookSecret;
    private final TenantRepository tenantRepository;
    private final DocumentService documentService;

    public EmailWebhookController(
            @Value("${email.webhook-secret}") String webhookSecret,
            TenantRepository tenantRepository,
            DocumentService documentService) {
        this.webhookSecret = webhookSecret;
        this.tenantRepository = tenantRepository;
        this.documentService = documentService;
    }

    /**
     * The secret is part of the path (rather than a header) because inbound-
     * parse providers generally don't support custom request signing the
     * way WhatsApp's verify-token handshake does — this is the equivalent
     * lightweight protection against strangers finding and posting to this
     * endpoint.
     */
    @PostMapping("/{secret}")
    public ResponseEntity<Void> receive(
            @PathVariable String secret,
            MultipartHttpServletRequest request) {
        if (!webhookSecret.equals(secret)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            processEmail(request);
        } catch (Exception e) {
            log.error("Failed to process inbound email", e);
        }
        return ResponseEntity.ok().build();
    }

    private void processEmail(MultipartHttpServletRequest request) throws IOException {
        String to = request.getParameter("to");
        UUID tenantId = extractTenantId(to);
        if (tenantId == null) {
            log.warn("Could not resolve a tenant from inbound email recipient: {}", to);
            return;
        }

        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
        if (tenant == null) {
            log.warn("Inbound email addressed to unknown tenant id: {}", tenantId);
            return;
        }

        TenantContext.setCurrentTenantId(tenant.getId());
        try {
            for (Map.Entry<String, MultipartFile> entry : request.getFileMap().entrySet()) {
                MultipartFile file = entry.getValue();
                if (file.isEmpty() || !ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
                    continue;
                }
                documentService.uploadDocument(file.getOriginalFilename(), file.getBytes(), file.getContentType());
            }
        } finally {
            TenantContext.clear();
        }
    }

    private static UUID extractTenantId(String to) {
        if (to == null) {
            return null;
        }
        Matcher matcher = TENANT_ID_PATTERN.matcher(to);
        if (!matcher.find()) {
            return null;
        }
        try {
            return UUID.fromString(matcher.group(1));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
