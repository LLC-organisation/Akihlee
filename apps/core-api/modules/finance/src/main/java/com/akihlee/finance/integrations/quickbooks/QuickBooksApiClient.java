package com.akihlee.finance.integrations.quickbooks;

import java.time.Instant;
import java.util.List;

/**
 * Interface for QuickBooks' Accounting API. Abstracts away the hand-rolled
 * HTTP calls to allow for testing and different implementations.
 */
public interface QuickBooksApiClient {

    /**
     * Fetch Purchase (expense) transactions for a given date range.
     *
     * @param accessToken the tenant's OAuth access token
     * @param realmId     the QuickBooks company ID this token was issued for
     * @param environment "production" or "sandbox" — selects the Accounting
     *                    data API host (unlike Square, this does NOT affect
     *                    the OAuth endpoints, which are the same for both)
     * @param startDate   start of date range
     * @param endDate     end of date range
     * @return list of purchases
     */
    List<QuickBooksPurchase> fetchPurchases(String accessToken, String realmId, String environment,
                                             Instant startDate, Instant endDate);
}
