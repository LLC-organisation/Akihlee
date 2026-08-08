package com.akihlee.finance.integrations.square;

import com.squareup.square.SquareClient;
import com.squareup.square.api.PaymentsApi;
import com.squareup.square.exceptions.ApiException;
import com.squareup.square.models.ListPaymentsResponse;
import com.squareup.square.models.Payment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Production implementation of Square API client using Square SDK.
 */
@Component
public class SquareApiClientImpl implements SquareApiClient {

    private static final Logger logger = LoggerFactory.getLogger(SquareApiClientImpl.class);

    private final SquareClient squareClient;

    public SquareApiClientImpl(@Value("${square.access-token}") String accessToken,
                               @Value("${square.environment:sandbox}") String environment) {
        this.squareClient = new SquareClient.Builder()
            .accessToken(accessToken)
            .environment(environment.equalsIgnoreCase("production") ?
                com.squareup.square.Environment.PRODUCTION :
                com.squareup.square.Environment.SANDBOX)
            .build();
    }

    @Override
    public List<Payment> fetchPayments(String locationId, Instant startDate, Instant endDate) {
        PaymentsApi paymentsApi = squareClient.getPaymentsApi();
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
    public boolean testConnection() {
        try {
            // Try to fetch recent payments as a connection test
            Instant now = Instant.now();
            fetchPayments(null, now.minusSeconds(60), now);
            return true;
        } catch (Exception e) {
            logger.error("Square connection test failed: {}", e.getMessage());
            return false;
        }
    }
}
