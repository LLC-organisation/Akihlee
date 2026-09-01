package com.akihlee.qbquickstart.api;

import com.akihlee.qbquickstart.oauth.IntuitApiException;
import com.akihlee.qbquickstart.oauth.QuickBooksProperties;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * QuickBooks Online Accounting API — company info and the Data Query API
 * ("SELECT ... FROM <Entity>"), which is how you pull transactions for
 * reporting/visibility rather than processing payments. Base host differs
 * by environment; the path shape does not:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account
 */
@Component
public class AccountingApiClient {

    private final QuickBooksProperties properties;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public AccountingApiClient(QuickBooksProperties properties) {
        this.properties = properties;
    }

    private String baseUrl() {
        return properties.isProduction()
                ? "https://quickbooks.api.intuit.com"
                : "https://sandbox-quickbooks.api.intuit.com";
    }

    /** GET /v3/company/{realmId}/companyinfo/{realmId} — the one-call sanity check that a token+realmId actually work. */
    public String getCompanyInfo(String realmId, String accessToken) {
        URI uri = URI.create(baseUrl() + "/v3/company/" + realmId + "/companyinfo/" + realmId);
        return get(uri, accessToken);
    }

    /**
     * Runs a Data Query API SELECT against the Accounting API — this is the
     * general-purpose way to pull transactions (Purchase, Deposit, Invoice,
     * Bill, JournalEntry, ...) for reporting rather than writing them.
     * `entity` is any queryable QBO entity name; response envelope is
     * {"QueryResponse": {"<Entity>": [...], "startPosition", "maxResults", "totalCount"}, "time": "..."}.
     */
    public String queryTransactions(String realmId, String accessToken, String entity, int maxResults) {
        String query = "SELECT * FROM " + entity + " MAXRESULTS " + maxResults;
        URI uri = URI.create(baseUrl() + "/v3/company/" + realmId + "/query?query="
                + URLEncoder.encode(query, StandardCharsets.UTF_8));
        return get(uri, accessToken);
    }

    private String get(URI uri, String accessToken) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new IllegalStateException("Network error calling the Accounting API: " + e.getMessage(), e);
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IntuitApiException("Accounting API call failed", response.statusCode(), response.body());
        }
        return response.body();
    }
}
