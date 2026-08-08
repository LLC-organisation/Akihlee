package com.akihlee.finance.integrations.square;

/**
 * Thrown when a tenant tries to sync Square but neither has their own
 * OAuth-connected account nor is covered by the operator's fallback
 * SQUARE_ACCESS_TOKEN. Caught by SquareIntegrationController and turned
 * into a 400 with a message pointing at the Integrations page.
 */
public class SquareNotConfiguredException extends RuntimeException {
    public SquareNotConfiguredException(String message) {
        super(message);
    }
}
