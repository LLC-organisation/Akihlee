package com.akihlee.qbquickstart.oauth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

/**
 * Step 1, 2 and 4 of the flow: build the consent URL, exchange a code for
 * tokens, and refresh. Endpoints below are Intuit's actual OAuth2 endpoints
 * (same for sandbox and production — only the Accounting/OpenID *data* API
 * hosts differ by environment, see AccountingApiClient/UserInfoClient):
 * https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
 */
@Component
public class IntuitOAuthClient {

    private static final String AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
    private static final String TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    private static final String REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

    private final QuickBooksProperties properties;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public IntuitOAuthClient(QuickBooksProperties properties) {
        this.properties = properties;
    }

    /** Step 1 — where to send the user's browser to consent and pick a sandbox company. */
    public String buildAuthorizeUrl(String state) {
        String scope = urlEncode(properties.scopes());
        return AUTHORIZE_URL
                + "?client_id=" + urlEncode(properties.clientId())
                + "&response_type=code"
                + "&scope=" + scope
                + "&redirect_uri=" + urlEncode(properties.redirectUri())
                + "&state=" + urlEncode(state);
    }

    /** Step 2 — trade the authorization code for an access/refresh token pair. */
    public TokenResponse exchangeCode(String code) {
        String body = "grant_type=authorization_code"
                + "&code=" + urlEncode(code)
                + "&redirect_uri=" + urlEncode(properties.redirectUri());
        return postToken(body);
    }

    /** Step 4 — trade a refresh token for a new access token (and a rotated refresh token). */
    public TokenResponse refresh(String refreshToken) {
        String body = "grant_type=refresh_token&refresh_token=" + urlEncode(refreshToken);
        return postToken(body);
    }

    /** Best-effort revoke on disconnect — not one of the four requested steps, but the
     *  natural counterpart to Step 2, so a "disconnect" button has somewhere to call. */
    public void revoke(String token) {
        String body = "{\"token\":\"" + token + "\"}";
        HttpRequest request = HttpRequest.newBuilder(URI.create(REVOKE_URL))
                .header("Authorization", basicAuthHeader())
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        send(request);
    }

    private TokenResponse postToken(String formBody) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(TOKEN_URL))
                .header("Authorization", basicAuthHeader())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(formBody))
                .build();
        HttpResponse<String> response = send(request);
        try {
            return mapper.readValue(response.body(), TokenResponse.class);
        } catch (Exception e) {
            throw new IllegalStateException("Intuit's token response wasn't the JSON shape we expected: " + response.body(), e);
        }
    }

    private HttpResponse<String> send(HttpRequest request) {
        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new IllegalStateException("Network error calling Intuit: " + e.getMessage(), e);
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IntuitApiException("Intuit rejected the request", response.statusCode(), response.body());
        }
        return response;
    }

    private String basicAuthHeader() {
        if (!properties.isConfigured()) {
            throw new IllegalStateException(
                    "QUICKBOOKS_CLIENT_SECRET is not set — export it before starting the app (see README.md).");
        }
        String credentials = properties.clientId() + ":" + properties.clientSecret();
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
