package com.akihlee.finance.integrations.square;

import java.time.Instant;

/**
 * Result of a Square OAuth token exchange or refresh.
 */
public record SquareTokenResult(
        String accessToken,
        String refreshToken,
        String merchantId,
        Instant expiresAt
) {
}
