package com.akihlee.qbquickstart.api;

import com.akihlee.qbquickstart.oauth.IntuitOAuthClient;
import com.akihlee.qbquickstart.oauth.TokenResponse;
import com.akihlee.qbquickstart.oauth.TokenStore;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Step 3 — the actual data calls, each auto-refreshing the access token first if it's stale. */
@RestController
public class ApiController {

    private final AccountingApiClient accountingApiClient;
    private final UserInfoClient userInfoClient;
    private final IntuitOAuthClient oAuthClient;
    private final TokenStore tokenStore;

    public ApiController(AccountingApiClient accountingApiClient, UserInfoClient userInfoClient,
                          IntuitOAuthClient oAuthClient, TokenStore tokenStore) {
        this.accountingApiClient = accountingApiClient;
        this.userInfoClient = userInfoClient;
        this.oAuthClient = oAuthClient;
        this.tokenStore = tokenStore;
    }

    @GetMapping(value = "/api/company-info", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> companyInfo() {
        TokenStore.StoredTokens tokens = freshTokens();
        String body = accountingApiClient.getCompanyInfo(tokens.realmId(), tokens.accessToken());
        return ResponseEntity.ok(body);
    }

    @GetMapping(value = "/api/user-info", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> userInfo() {
        TokenStore.StoredTokens tokens = freshTokens();
        String body = userInfoClient.getUserInfo(tokens.accessToken());
        return ResponseEntity.ok(body);
    }

    /**
     * Pulls transactions for visibility (not payment processing). `entity`
     * defaults to Purchase (expenses) — swap it for Deposit, Invoice, Bill,
     * JournalEntry, etc. per the Accounting API's queryable entity list:
     * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchase
     */
    @GetMapping(value = "/api/transactions", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> transactions(
            @RequestParam(defaultValue = "Purchase") String entity,
            @RequestParam(defaultValue = "50") int maxResults
    ) {
        TokenStore.StoredTokens tokens = freshTokens();
        String body = accountingApiClient.queryTransactions(tokens.realmId(), tokens.accessToken(), entity, maxResults);
        return ResponseEntity.ok(body);
    }

    private TokenStore.StoredTokens freshTokens() {
        if (!tokenStore.isConnected()) {
            throw new IllegalStateException("Not connected yet — run Step 1 (GET /connect) and Step 2 (POST /exchange) first.");
        }
        if (tokenStore.accessTokenNeedsRefresh()) {
            TokenStore.StoredTokens current = tokenStore.current();
            TokenResponse refreshed = oAuthClient.refresh(current.refreshToken());
            tokenStore.updateAfterRefresh(
                    refreshed.getAccessToken(),
                    refreshed.getRefreshToken(),
                    refreshed.getExpiresInSeconds(),
                    refreshed.getRefreshTokenExpiresInSeconds()
            );
        }
        return tokenStore.current();
    }
}
