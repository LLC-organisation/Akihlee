package com.akihlee.finance.integrations.square;

import com.squareup.square.models.Payment;

import java.time.Instant;
import java.util.List;

/**
 * Interface for Square API integration.
 * Abstracts away the Square SDK to allow for testing and different implementations.
 */
public interface SquareApiClient {

    /**
     * Fetch payments from Square for a given date range.
     *
     * @param accessToken Access token to authenticate as — either the
     *                    tenant's own OAuth-connected token, or the
     *                    operator's fallback SQUARE_ACCESS_TOKEN. Callers
     *                    resolve which one applies (see SquareSyncService);
     *                    this client has no notion of "current tenant".
     * @param environment "production" or "sandbox" — must match whichever
     *                    Square environment accessToken was issued for.
     * @param locationId Square location ID (optional, null for all locations)
     * @param startDate Start of date range
     * @param endDate End of date range
     * @return List of Square payments
     */
    List<Payment> fetchPayments(String accessToken, String environment, String locationId, Instant startDate, Instant endDate);

    /**
     * Test the connection to Square API.
     *
     * @return true if connection is successful
     */
    boolean testConnection(String accessToken, String environment);
}
