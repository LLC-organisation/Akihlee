package com.akihlee.qbquickstart.api;

import com.akihlee.qbquickstart.oauth.IntuitApiException;
import com.akihlee.qbquickstart.oauth.QuickBooksProperties;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * OpenID Connect userinfo endpoint — needs the "openid" (plus profile/
 * email/phone/address) scopes granted at Step 1. Unlike the Accounting API,
 * this lives under a separate "accounts" host, sandbox vs. production.
 */
@Component
public class UserInfoClient {

    private final QuickBooksProperties properties;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public UserInfoClient(QuickBooksProperties properties) {
        this.properties = properties;
    }

    public String getUserInfo(String accessToken) {
        String baseUrl = properties.isProduction()
                ? "https://accounts.platform.intuit.com"
                : "https://sandbox-accounts.platform.intuit.com";
        URI uri = URI.create(baseUrl + "/v1/openid_connect/userinfo");

        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new IllegalStateException("Network error calling the userinfo endpoint: " + e.getMessage(), e);
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IntuitApiException("userinfo call failed", response.statusCode(), response.body());
        }
        return response.body();
    }
}
