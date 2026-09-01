package com.akihlee.qbquickstart.oauth;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

/**
 * Steps 1, 2 and 4. Note this app's redirect_uri (from application.properties)
 * points at Intuit's own hosted Quickstart page, not a route in this app —
 * see README.md for why /exchange takes code/realmId/state as a manually
 * pasted form instead of receiving an automatic callback.
 */
@RestController
public class OAuthController {

    private final IntuitOAuthClient oAuthClient;
    private final TokenStore tokenStore;
    private final SecureRandom random = new SecureRandom();

    // Single in-memory slot: fine for one developer running this locally
    // against one sandbox company. A real multi-user app must key this by
    // session (or a short-lived cache) instead of a single field.
    private volatile String pendingState;

    public OAuthController(IntuitOAuthClient oAuthClient, TokenStore tokenStore) {
        this.oAuthClient = oAuthClient;
        this.tokenStore = tokenStore;
    }

    /** Step 1 — generates state, remembers it, then 302s the browser to Intuit's consent screen. */
    @GetMapping("/connect")
    public ResponseEntity<Void> connect() {
        byte[] stateBytes = new byte[24];
        random.nextBytes(stateBytes);
        pendingState = Base64.getUrlEncoder().withoutPadding().encodeToString(stateBytes);

        String authorizeUrl = oAuthClient.buildAuthorizeUrl(pendingState);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, authorizeUrl)
                .build();
    }

    /**
     * Step 2 — call this with the code/realmId/state Intuit's Quickstart
     * page displayed after you consented. Rejects a state that doesn't
     * match what /connect generated, which is what makes state useful
     * against CSRF — don't skip this check.
     */
    @PostMapping("/exchange")
    public ResponseEntity<Map<String, Object>> exchange(
            @RequestParam String code,
            @RequestParam String realmId,
            @RequestParam String state
    ) {
        if (pendingState == null || !pendingState.equals(state)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "state mismatch — start again from GET /connect"));
        }
        pendingState = null;

        TokenResponse tokens = oAuthClient.exchangeCode(code);
        tokenStore.save(
                tokens.getAccessToken(),
                tokens.getRefreshToken(),
                realmId,
                tokens.getExpiresInSeconds(),
                tokens.getRefreshTokenExpiresInSeconds()
        );
        return ResponseEntity.ok(Map.of(
                "connected", true,
                "realmId", realmId,
                "accessTokenExpiresInSeconds", tokens.getExpiresInSeconds()
        ));
    }

    /** Step 4 — trigger a refresh manually. ApiController also does this automatically before each call. */
    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh() {
        TokenStore.StoredTokens current = tokenStore.current();
        if (current == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "not connected — run Step 1/2 first"));
        }
        TokenResponse refreshed = oAuthClient.refresh(current.refreshToken());
        tokenStore.updateAfterRefresh(
                refreshed.getAccessToken(),
                refreshed.getRefreshToken(),
                refreshed.getExpiresInSeconds(),
                refreshed.getRefreshTokenExpiresInSeconds()
        );
        return ResponseEntity.ok(Map.of(
                "refreshed", true,
                "accessTokenExpiresInSeconds", refreshed.getExpiresInSeconds()
        ));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<Void> disconnect() {
        TokenStore.StoredTokens current = tokenStore.current();
        if (current != null) {
            try {
                oAuthClient.revoke(current.refreshToken());
            } catch (RuntimeException ignored) {
                // Best-effort — still clear local state even if Intuit's revoke call fails.
            }
        }
        tokenStore.clear();
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, "/").build();
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        TokenStore.StoredTokens current = tokenStore.current();
        if (current == null) {
            return ResponseEntity.ok(Map.of("connected", false));
        }
        return ResponseEntity.ok(Map.of(
                "connected", true,
                "realmId", current.realmId(),
                "accessTokenExpiresAt", current.accessTokenExpiresAt().toString(),
                "refreshTokenExpiresAt", current.refreshTokenExpiresAt().toString()
        ));
    }
}
