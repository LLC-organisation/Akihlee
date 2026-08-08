package com.akihlee.finance.integrations.square;

import com.akihlee.identity.AuditAction;
import com.akihlee.identity.AuditLogService;
import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations/square")
public class SquareIntegrationController {

    private final SquareSyncService squareSyncService;
    private final SquareOAuthService squareOAuthService;
    private final TenantRepository tenantRepository;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;
    private final String webUrl;

    public SquareIntegrationController(
            SquareSyncService squareSyncService,
            SquareOAuthService squareOAuthService,
            TenantRepository tenantRepository,
            AuditLogService auditLogService,
            UserRepository userRepository,
            @Value("${app.web-url:http://localhost:3000}") String webUrl) {
        this.squareSyncService = squareSyncService;
        this.squareOAuthService = squareOAuthService;
        this.tenantRepository = tenantRepository;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
        // Tolerate a trailing slash in APP_WEB_URL (an easy copy-paste
        // mistake) — left in, "url//integrations" is a different path than
        // "/integrations" as far as Next.js routing is concerned.
        this.webUrl = webUrl.endsWith("/") ? webUrl.substring(0, webUrl.length() - 1) : webUrl;
    }

    /**
     * Manually triggers a sync of the last 30 days of Square payments for
     * the current tenant. Fixed window, no "since last sync" cursor — the
     * existing idempotency check (SquareTransaction.externalId) means a
     * repeat sync just costs a wasted Square API call, not duplicate data.
     */
    @PostMapping("/sync")
    public ResponseEntity<Map<String, Object>> sync() {
        Instant end = Instant.now();
        Instant start = end.minus(30, ChronoUnit.DAYS);
        try {
            int imported = squareSyncService.syncTransactions(start, end);
            return ResponseEntity.ok(Map.of("imported", imported));
        } catch (SquareNotConfiguredException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Returns the URL to send the browser to for Square's own consent
     * screen. A JSON endpoint rather than a redirect itself, since the
     * frontend calls this via an authenticated fetch (needs the JWT to
     * know which tenant) and then does the actual top-level navigation
     * itself — a plain <a href> to a JWT-protected backend route can't
     * carry the Authorization header.
     */
    @PostMapping("/oauth/authorize-url")
    public ResponseEntity<Map<String, String>> authorizeUrl() {
        if (!squareOAuthService.isConfigured()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Square OAuth isn't configured for this deployment."));
        }
        UUID tenantId = TenantContext.getCurrentTenantId();
        return ResponseEntity.ok(Map.of("url", squareOAuthService.buildAuthorizeUrl(tenantId)));
    }

    /**
     * Square redirects the user's browser here after they approve (or
     * deny) access. Public — see SecurityConfig — since this is a
     * top-level navigation from Square's domain with no JWT attached; the
     * signed `state` param is what proves which tenant this belongs to.
     */
    @GetMapping("/oauth/callback")
    public ResponseEntity<Void> oauthCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {
        if (error != null || code == null || state == null) {
            return redirectToIntegrations("error");
        }

        UUID tenantId;
        try {
            tenantId = squareOAuthService.verifyState(state);
        } catch (Exception e) {
            return redirectToIntegrations("error");
        }

        try {
            SquareTokenResult result = squareOAuthService.exchangeCodeForToken(code);
            Tenant tenant = tenantRepository.findById(tenantId)
                    .orElseThrow(() -> new IllegalStateException("Tenant not found: " + tenantId));
            tenant.connectSquare(result.accessToken(), result.refreshToken(), result.merchantId(), result.expiresAt());
            tenantRepository.save(tenant);

            auditLogService.log(tenantId, null, "square-oauth-callback",
                    AuditAction.SQUARE_CONNECTED, "TENANT", tenantId.toString(), result.merchantId());

            return redirectToIntegrations("connected");
        } catch (Exception e) {
            return redirectToIntegrations("error");
        }
    }

    @DeleteMapping("/oauth")
    public ResponseEntity<Void> disconnect() {
        Tenant tenant = tenantRepository.findById(TenantContext.getCurrentTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));

        if (tenant.isSquareConnected()) {
            squareOAuthService.revokeToken(tenant.getSquareAccessToken(), tenant.getSquareMerchantId());
        }
        tenant.disconnectSquare();
        tenantRepository.save(tenant);

        auditLogService.log(tenant.getId(), currentUserId(), currentUserEmail(),
                AuditAction.SQUARE_DISCONNECTED, "TENANT", tenant.getId().toString(), null);

        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<Void> redirectToIntegrations(String squareStatus) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, webUrl + "/integrations?square=" + squareStatus)
                .build();
    }

    private UUID currentUserId() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) {
            return null;
        }
        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String currentUserEmail() {
        UUID userId = currentUserId();
        return userId != null ? userRepository.findById(userId).map(User::getEmail).orElse(null) : null;
    }
}
