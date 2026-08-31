package com.akihlee.finance.integrations.quickbooks;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Hand-rolled client for QuickBooks' Accounting Query API — see
 * QuickBooksOAuthService's class comment for why this isn't built on
 * Intuit's (unpublished) Java SDK.
 *
 * Unlike Square's Payments API, QuickBooks' TotalAmt is already a plain
 * decimal amount (not minor-unit cents) — no /100 conversion needed here.
 */
@Component
public class QuickBooksApiClientImpl implements QuickBooksApiClient {

    private static final Logger logger = LoggerFactory.getLogger(QuickBooksApiClientImpl.class);
    private static final int PAGE_SIZE = 1000; // QuickBooks Query API's per-call cap
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public QuickBooksApiClientImpl(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    @Override
    public List<QuickBooksPurchase> fetchPurchases(String accessToken, String realmId, String environment,
                                                     Instant startDate, Instant endDate) {
        String base = "production".equalsIgnoreCase(environment)
                ? "https://quickbooks.api.intuit.com"
                : "https://sandbox-quickbooks.api.intuit.com";
        String from = DATE_FORMAT.format(startDate.atZone(ZoneOffset.UTC).toLocalDate());
        String to = DATE_FORMAT.format(endDate.atZone(ZoneOffset.UTC).toLocalDate());

        List<QuickBooksPurchase> allPurchases = new ArrayList<>();
        int startPosition = 1;
        while (true) {
            String query = "SELECT * FROM Purchase WHERE TxnDate >= '" + from + "' AND TxnDate <= '" + to
                    + "' ORDER BY TxnDate STARTPOSITION " + startPosition + " MAXRESULTS " + PAGE_SIZE;
            String url = base + "/v3/company/" + realmId + "/query?query=" + encode(query);

            JsonNode purchases = queryPage(url, accessToken);
            int pageCount = purchases.size();
            for (JsonNode node : purchases) {
                allPurchases.add(toPurchase(node));
            }

            if (pageCount < PAGE_SIZE) {
                break;
            }
            startPosition += PAGE_SIZE;
        }

        logger.info("Fetched {} purchases from QuickBooks", allPurchases.size());
        return allPurchases;
    }

    private JsonNode queryPage(String url, String accessToken) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                throw new RuntimeException("QuickBooks API error: " + response.statusCode() + " " + response.body());
            }
            JsonNode root = objectMapper.readTree(response.body());
            return root.path("QueryResponse").path("Purchase");
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("QuickBooks API request failed: " + e.getMessage(), e);
        }
    }

    private QuickBooksPurchase toPurchase(JsonNode node) {
        String id = node.hasNonNull("Id") ? node.get("Id").asText() : null;
        LocalDate txnDate = node.hasNonNull("TxnDate") ? LocalDate.parse(node.get("TxnDate").asText()) : null;
        BigDecimal totalAmt = node.hasNonNull("TotalAmt") ? node.get("TotalAmt").decimalValue() : BigDecimal.ZERO;
        String currency = node.path("CurrencyRef").path("value").asText("USD");
        String accountName = node.path("AccountRef").path("name").asText(null);
        String payeeName = node.path("EntityRef").path("name").asText(null);
        String memo = node.path("Memo").asText(null);
        return new QuickBooksPurchase(id, txnDate, totalAmt, currency, accountName, payeeName, memo);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
