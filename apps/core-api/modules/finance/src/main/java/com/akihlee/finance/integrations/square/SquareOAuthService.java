package com.akihlee.finance.integrations.square;

import com.akihlee.identity.JwtService;
import com.squareup.square.Environment;
import com.squareup.square.SquareClient;
import com.squareup.square.exceptions.ApiException;
import com.squareup.square.models.ObtainTokenRequest;
import com.squareup.square.models.ObtainTokenResponse;
import com.squareup.square.models.RevokeTokenRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

/**
 * Handles Square's OAuth "Connect with Square" flow so any tenant can link
 * their own Square account from the Integrations page, rather than every
 * tenant sharing the operator's single SQUARE_ACCESS_TOKEN env var.
 *
 * Uses the Square SDK's OAuthApi (obtainToken/revokeToken) rather than
 * hand-rolled HTTP calls, so request/response shapes and auth headers stay
 * correct as the SDK is upgraded.
 */
@Service
public class SquareOAuthService {

    private static final Logger logger = LoggerFactory.getLogger(SquareOAuthService.class);

    // MERCHANT_PROFILE_READ lets a merchant name be shown in the UI later;
    // PAYMENTS_READ is the only scope SquareSyncService actually needs today.
    private static final String OAUTH_SCOPE = "PAYMENTS_READ MERCHANT_PROFILE_READ";

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final boolean production;
    private final JwtService jwtService;
    private final SquareClient oauthClient;

    public SquareOAuthService(
            @Value("${square.oauth.client-id:}") String clientId,
            @Value("${square.oauth.client-secret:}") String clientSecret,
            @Value("${square.oauth.redirect-uri:}") String redirectUri,
            @Value("${square.environment:sandbox}") String environment,
            JwtService jwtService) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.production = environment.equalsIgnoreCase("production");
        this.jwtService = jwtService;
        this.oauthClient = new SquareClient.Builder()
                .environment(production ? Environment.PRODUCTION : Environment.SANDBOX)
                .build();
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
    }

    /**
     * Builds the URL to send a tenant's browser to for Square's own
     * login/consent screen. `state` is a signed, short-lived token (not a
     * random opaque string) so the callback can trust which tenant it
     * belongs to without a session store.
     */
    public String buildAuthorizeUrl(UUID tenantId) {
        String state = jwtService.generateStateToken(tenantId);
        String base = production
                ? "https://connect.squareup.com/oauth2/authorize"
                : "https://connect.squareupsandbox.com/oauth2/authorize";
        // redirect_uri must be sent here too, not just at token exchange:
        // Square's ObtainToken only accepts/validates redirect_uri when the
        // authorize request also carried one (see SquareOAuthService class
        // comment) — sending it in exchangeCodeForToken without it having
        // been part of the original authorize call is what was breaking the
        // sandbox flow (Square rejects the mismatch right after consent).
        String url = base
                + "?client_id=" + encode(clientId)
                + "&scope=" + encode(OAUTH_SCOPE)
                + "&redirect_uri=" + encode(redirectUri)
                + "&state=" + encode(state);
        // session=false is Production-only — per Square's own OAuth
        // walkthrough reference table, Sandbox supports only session=true
        // (the default) and rejects session=false outright with a 400 on
        // /oauth2/authorize itself, before the user ever sees a consent
        // screen. Omit the param entirely in Sandbox rather than sending
        // session=true explicitly, matching what "default" means there.
        if (production) {
            url += "&session=false";
        }
        return url;
    }

    /** Verifies the `state` param a callback was invoked with and returns the tenant it belongs to. */
    public UUID verifyState(String state) {
        return jwtService.parseStateToken(state);
    }

    public SquareTokenResult exchangeCodeForToken(String code) {
        return toResult(callObtainToken(
                new ObtainTokenRequest.Builder(clientId, "authorization_code")
                        .clientSecret(clientSecret)
                        .code(code)
                        .redirectUri(redirectUri)
                        .build()));
    }

    public SquareTokenResult refreshAccessToken(String refreshToken) {
        return toResult(callObtainToken(
                new ObtainTokenRequest.Builder(clientId, "refresh_token")
                        .clientSecret(clientSecret)
                        .refreshToken(refreshToken)
                        .build()));
    }

    /**
     * Best-effort: a failed revoke shouldn't block the tenant from
     * disconnecting locally (they'd otherwise be stuck "connected" in our
     * UI over a Square-side hiccup they have no way to retry).
     */
    public void revokeToken(String accessToken, String merchantId) {
        try {
            RevokeTokenRequest request = new RevokeTokenRequest.Builder()
                    .clientId(clientId)
                    .accessToken(accessToken)
                    .merchantId(merchantId)
                    .build();
            oauthClient.getOAuthApi().revokeToken(request, "Client " + clientSecret);
        } catch (Exception e) {
            logger.warn("Failed to revoke Square token (local disconnect still proceeds): {}", e.getMessage());
        }
    }

    private ObtainTokenResponse callObtainToken(ObtainTokenRequest request) {
        try {
            return oauthClient.getOAuthApi().obtainToken(request);
        } catch (ApiException e) {
            throw new RuntimeException("Square OAuth token exchange failed: " + e.getMessage(), e);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static SquareTokenResult toResult(ObtainTokenResponse response) {
        return new SquareTokenResult(
                response.getAccessToken(),
                response.getRefreshToken(),
                response.getMerchantId(),
                response.getExpiresAt() != null ? Instant.parse(response.getExpiresAt()) : null);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
