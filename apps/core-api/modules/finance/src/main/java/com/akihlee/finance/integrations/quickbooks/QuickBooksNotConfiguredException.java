package com.akihlee.finance.integrations.quickbooks;

/**
 * Thrown when a tenant tries to sync QuickBooks without having connected
 * their own company — there's no operator-fallback credential the way
 * Square has SQUARE_ACCESS_TOKEN, since QuickBooks is OAuth-only. Caught
 * by QuickBooksIntegrationController and turned into a 400 with a message
 * pointing at the Integrations page.
 */
public class QuickBooksNotConfiguredException extends RuntimeException {
    public QuickBooksNotConfiguredException(String message) {
        super(message);
    }
}
