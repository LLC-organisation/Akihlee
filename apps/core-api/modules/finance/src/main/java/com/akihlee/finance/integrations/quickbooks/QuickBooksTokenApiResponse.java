package com.akihlee.finance.integrations.quickbooks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Raw wire shape of QuickBooks' POST /oauth2/v1/tokens/bearer response. */
@JsonIgnoreProperties(ignoreUnknown = true)
record QuickBooksTokenApiResponse(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("refresh_token") String refreshToken,
        @JsonProperty("expires_in") Long expiresIn,
        @JsonProperty("token_type") String tokenType) {
}
