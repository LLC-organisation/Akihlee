package com.akihlee.qbquickstart.oauth;

/**
 * Wraps a non-2xx response from any Intuit endpoint (OAuth token endpoint,
 * Accounting API, OpenID userinfo). Carries the raw HTTP status and body
 * through unmodified rather than trying to re-shape Intuit's error JSON
 * into a typed object — Intuit's error shapes differ per API (OAuth errors
 * are {"error":..., "error_description":...}; Accounting API errors are a
 * {"Fault": {...}} envelope) and guessing a merged shape risks hiding the
 * actual message. Surface exactly what Intuit sent back.
 */
public class IntuitApiException extends RuntimeException {

    private final int statusCode;
    private final String responseBody;

    public IntuitApiException(String message, int statusCode, String responseBody) {
        super(message + " (HTTP " + statusCode + "): " + responseBody);
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public String getResponseBody() {
        return responseBody;
    }
}
