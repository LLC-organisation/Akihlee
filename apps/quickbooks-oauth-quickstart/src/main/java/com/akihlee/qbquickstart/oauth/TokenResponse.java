package com.akihlee.qbquickstart.oauth;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Shape of Intuit's token endpoint response (both the authorization_code
 * exchange and the refresh_token grant return the same shape). Field names
 * verified against Intuit's own oauth-jsclient README and the OAuth2 spec
 * Intuit's docs reference — not guessed:
 * https://github.com/intuit/oauth-jsclient
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TokenResponse {

    @JsonProperty("token_type")
    private String tokenType;

    @JsonProperty("access_token")
    private String accessToken;

    @JsonProperty("refresh_token")
    private String refreshToken;

    @JsonProperty("expires_in")
    private long expiresInSeconds;

    // Refresh tokens roll forward ~100 days of validity each time they're
    // used — this field is Intuit's authoritative source for exactly how
    // long, don't hardcode "100 days" against it.
    @JsonProperty("x_refresh_token_expires_in")
    private long refreshTokenExpiresInSeconds;

    // Only present when the "openid" scope was requested.
    @JsonProperty("id_token")
    private String idToken;

    public String getTokenType() {
        return tokenType;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public long getExpiresInSeconds() {
        return expiresInSeconds;
    }

    public long getRefreshTokenExpiresInSeconds() {
        return refreshTokenExpiresInSeconds;
    }

    public String getIdToken() {
        return idToken;
    }
}
