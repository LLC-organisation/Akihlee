package com.akihlee.qbquickstart.oauth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class QuickBooksProperties {

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String scopes;
    private final String environment;
    private final String tokenStorePath;

    public QuickBooksProperties(
            @Value("${quickbooks.client-id}") String clientId,
            @Value("${quickbooks.client-secret}") String clientSecret,
            @Value("${quickbooks.redirect-uri}") String redirectUri,
            @Value("${quickbooks.scopes}") String scopes,
            @Value("${quickbooks.environment}") String environment,
            @Value("${quickbooks.token-store-path}") String tokenStorePath
    ) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.scopes = scopes;
        this.environment = environment;
        this.tokenStorePath = tokenStorePath;
    }

    public String clientId() {
        return clientId;
    }

    public String clientSecret() {
        return clientSecret;
    }

    public String redirectUri() {
        return redirectUri;
    }

    public String scopes() {
        return scopes;
    }

    public String environment() {
        return environment;
    }

    public boolean isProduction() {
        return "production".equalsIgnoreCase(environment);
    }

    public String tokenStorePath() {
        return tokenStorePath;
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }
}
