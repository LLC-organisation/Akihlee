package com.akihlee.finance.integrations.square;

import com.squareup.square.SquareClient;
import com.squareup.square.api.PaymentsApi;
import com.squareup.square.exceptions.ApiException;
import com.squareup.square.models.ListPaymentsResponse;
import com.squareup.square.models.Payment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Production implementation of Square API client using Square SDK.
 *
 * Builds a fresh SquareClient per call rather than holding one configured
 * at startup — each call can be authenticating as a different tenant's own
 * OAuth-connected Square account (see SquareSyncService), not one shared
 * operator token.
 */
@Component
public class SquareApiClientImpl implements SquareApiClient {

    private static final Logger logger = LoggerFactory.getLogger(SquareApiClientImpl.class);

    private SquareClient buildClient(String accessToken, String environment) {
        return new SquareClient.Builder()
            .accessToken(accessToken)
            .environment(environment.equalsIgnoreCase("production") ?
                com.squareup.square.Environment.PRODUCTION :
                com.squareup.square.Environment.SANDBOX)
            .build();
    }

    @Override
    public List<Payment> fetchPayments(String accessToken, String environment, String locationId, Instant startDate, Instant endDate) {
        PaymentsApi paymentsApi = buildClient(accessToken, environment).getPaymentsApi();
        List<Payment> allPayments = new ArrayList<>();

        try {
            // listPayments takes positional query params in this SDK version
            // (beginTime, endTime, sortOrder, cursor, locationId, total,
            // last4, cardBrand, limit) rather than a request-object builder.
            String cursor = null;
            do {
                ListPaymentsResponse response = paymentsApi.listPayments(
                        startDate.toString(),
                        endDate.toString(),
                        "ASC",
                        cursor,
                        locationId,
                        null,
                        null,
                        null,
                        null);

                if (response.getPayments() != null) {
                    allPayments.addAll(response.getPayments());
                }

                cursor = response.getCursor();

            } while (cursor != null);

            logger.info("Fetched {} payments from Square", allPayments.size());
            return allPayments;

        } catch (ApiException | IOException e) {
            logger.error("Failed to fetch payments from Square: {}", e.getMessage(), e);
            throw new RuntimeException("Square API error: " + e.getMessage(), e);
        }
    }

    @Override
    public boolean testConnection(String accessToken, String environment) {
        try {
            // Try to fetch recent payments as a connection test
            Instant now = Instant.now();
            fetchPayments(accessToken, environment, null, now.minusSeconds(60), now);
            return true;
        } catch (Exception e) {
            logger.error("Square connection test failed: {}", e.getMessage());
            return false;
        }
    }
}
