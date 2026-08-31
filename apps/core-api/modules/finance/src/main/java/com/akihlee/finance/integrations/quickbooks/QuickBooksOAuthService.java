package com.akihlee.finance.integrations.quickbooks;

import com.akihlee.identity.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Handles QuickBooks' OAuth "Connect with QuickBooks" flow so any tenant
 * can link their own QuickBooks company from the Integrations page.
 *
 * Hand-rolled HTTP calls rather than Intuit's Java SDK: that SDK
 * (intuit/QuickBooks-V3-Java-SDK) is not published to Maven Central or
 * anywhere else Gradle can resolve — its own pom.xml has
 * &lt;distributionManagement&gt; entirely commented out, meaning it was never
 * actually published, only ever built from source. This repo already got
 * bitten once by an unverifiable pinned SDK version (see
 * finance/build.gradle.kts' Square SDK comment); the OAuth + one-query
 * surface this integration needs is small enough that hand-rolling it
 * with java.net.http.HttpClient (already in the JDK) is safer than
 * vendoring an unpublished SDK.
 *
 * Endpoints below are the same for sandbox and production — confirmed
 * directly against Intuit's own OAuth discovery documents
 * (https://developer.api.intuit.com/.well-known/openid_configuration and
 * .../openid_sandbox_configuration both return identical
 * authorization_endpoint/token_endpoint/revocation_endpoint values). Only
 * the Accounting *data* API host differs by environment — see
 * QuickBooksApiClientImpl — the opposite split from Square, where the
 * OAuth host itself changes per environment but the SDK resolves the data
 * API host the same way.
 */
@Service
public class QuickBooksOAuthService {

    private static final Logger logger = LoggerFactory.getLogger(QuickBooksOAuthService.class);

    private static final String AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
    private static final String TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    private static final String REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
    private static final String SCOPE = "com.intuit.quickbooks.accounting";

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final JwtService jwtService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public QuickBooksOAuthService(
            @Value("${quickbooks.oauth.client-id:}") String clientId,
            @Value("${quickbooks.oauth.client-secret:}") String clientSecret,
            @Value("${quickbooks.oauth.redirect-uri:}") String redirectUri,
            JwtService jwtService,
            ObjectMapper objectMapper) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.jwtService = jwtService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
    }

    /**
     * Builds the URL to send a tenant's browser to for Intuit's own
     * login/consent screen. `state` is a signed, short-lived token —
     * reuses the same JwtService state-token mechanism Square's OAuth
     * flow uses — so the callback can trust which tenant it belongs to
     * without a session store.
     */
    public String buildAuthorizeUrl(UUID tenantId) {
        String state = jwtService.generateStateToken(tenantId);
        return AUTHORIZE_URL
                + "?client_id=" + encode(clientId)
                + "&redirect_uri=" + encode(redirectUri)
                + "&response_type=code"
                + "&scope=" + encode(SCOPE)
                + "&state=" + encode(state);
    }

    /** Verifies the `state` param a callback was invoked with and returns the tenant it belongs to. */
    public UUID verifyState(String state) {
        return jwtService.parseStateToken(state);
    }

    public QuickBooksTokenResult exchangeCodeForToken(String code) {
        return toResult(callTokenEndpoint("grant_type=authorization_code"
                + "&code=" + encode(code)
                + "&redirect_uri=" + encode(redirectUri)));
    }

    /**
     * QuickBooks refresh tokens rotate on every use — the response's
     * refresh_token is a NEW token that must overwrite the one just spent,
     * or the *next* refresh fails (this refresh itself still succeeds,
     * which makes the bug easy to miss until the old token is tried again
     * a day later). Callers must persist refreshed.refreshToken(), not
     * just refreshed.accessToken().
     */
    public QuickBooksTokenResult refreshAccessToken(String refreshToken) {
        return toResult(callTokenEndpoint("grant_type=refresh_token"
                + "&refresh_token=" + encode(refreshToken)));
    }

    /**
     * Best-effort: a failed revoke shouldn't block the tenant from
     * disconnecting locally (they'd otherwise be stuck "connected" in our
     * UI over an Intuit-side hiccup they have no way to retry).
     */
    public void revokeToken(String token) {
        if (token == null) {
            return;
        }
        try {
            String body = objectMapper.writeValueAsString(Map.of("token", token));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(REVOKE_URL))
                    .header("Authorization", basicAuthHeader())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                logger.warn("QuickBooks token revoke returned {}: {}", response.statusCode(), response.body());
            }
        } catch (Exception e) {
            logger.warn("Failed to revoke QuickBooks token (local disconnect still proceeds): {}", e.getMessage());
        }
    }

    private QuickBooksTokenApiResponse callTokenEndpoint(String formBody) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(TOKEN_URL))
                    .header("Authorization", basicAuthHeader())
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(formBody))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                throw new RuntimeException("QuickBooks OAuth token request failed: " + response.statusCode() + " " + response.body());
            }
            return objectMapper.readValue(response.body(), QuickBooksTokenApiResponse.class);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("QuickBooks OAuth token request failed: " + e.getMessage(), e);
        }
    }

    private String basicAuthHeader() {
        String credentials = clientId + ":" + clientSecret;
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    private static QuickBooksTokenResult toResult(QuickBooksTokenApiResponse response) {
        Instant expiresAt = response.expiresIn() != null ? Instant.now().plusSeconds(response.expiresIn()) : null;
        return new QuickBooksTokenResult(response.accessToken(), response.refreshToken(), expiresAt);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
