package com.akihlee.finance.integrations.quickbooks;

import java.time.Instant;

/**
 * Result of a QuickBooks OAuth token exchange or refresh. No realmId here,
 * unlike Square's merchantId — QuickBooks returns the company's realmId as
 * a query param on the OAuth callback itself, not inside the token
 * response body (see QuickBooksIntegrationController.oauthCallback).
 */
public record QuickBooksTokenResult(
        String accessToken,
        String refreshToken,
        Instant expiresAt
) {
}
