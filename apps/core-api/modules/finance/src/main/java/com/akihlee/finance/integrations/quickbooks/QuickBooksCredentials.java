package com.akihlee.finance.integrations.quickbooks;

/** Resolved credentials for one sync call — the tenant's own connected QuickBooks company. */
record QuickBooksCredentials(String accessToken, String realmId, String environment) {
}
