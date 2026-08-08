package com.akihlee.finance.integrations.square;

import com.squareup.square.models.Payment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Mock Square API client for testing.
 * Allows tests to control what payments are "returned" from Square.
 */
@TestConfiguration
public class MockSquareApiClient implements SquareApiClient {

    private List<Payment> mockPayments = new ArrayList<>();

    @Override
    public List<Payment> fetchPayments(String accessToken, String environment, String locationId, Instant startDate, Instant endDate) {
        return new ArrayList<>(mockPayments);
    }

    @Override
    public boolean testConnection(String accessToken, String environment) {
        return true;
    }

    /**
     * Set the mock payments to be returned by fetchPayments().
     */
    public void setMockPayments(List<Payment> payments) {
        this.mockPayments = new ArrayList<>(payments);
    }

    public void clearMockPayments() {
        this.mockPayments.clear();
    }

    @Bean
    @Primary
    public SquareApiClient squareApiClient() {
        return this;
    }
}
