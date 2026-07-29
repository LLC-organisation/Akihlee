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
     * @param locationId Square location ID (optional, null for all locations)
     * @param startDate Start of date range
     * @param endDate End of date range
     * @return List of Square payments
     */
    List<Payment> fetchPayments(String locationId, Instant startDate, Instant endDate);

    /**
     * Test the connection to Square API.
     *
     * @return true if connection is successful
     */
    boolean testConnection();
}
