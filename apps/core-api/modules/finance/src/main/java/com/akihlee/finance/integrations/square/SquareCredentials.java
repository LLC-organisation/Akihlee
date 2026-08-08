package com.akihlee.finance.integrations.square;

/** Resolved credentials for one sync call — either a tenant's own OAuth token or the operator's fallback. */
record SquareCredentials(String accessToken, String environment) {
}
