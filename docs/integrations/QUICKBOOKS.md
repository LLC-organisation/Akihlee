# QuickBooks Integration

QuickBooks Online is a bookkeeping system many small businesses already use — this integration pulls a
tenant's recorded expenses (Purchase transactions) into Akihlee for review, the same way uploaded
receipts and Square payments are reviewed.

## Overview

The QuickBooks integration syncs:
- **Purchases**: Credit card charges, checks, and cash expenses recorded in QuickBooks — always an
  expense, already categorized by whoever entered it (`AccountRef.name`)

Unlike Square, QuickBooks is **OAuth-only** — there's no shared long-lived access-token fallback. Every
tenant must connect their own company from the Integrations page.

## Architecture

```
QuickBooks Accounting API (Query endpoint, SELECT * FROM Purchase ...)
    ↓ (hand-rolled REST calls — no Maven-resolvable SDK exists, see below)
QuickBooksApiClient (QuickBooksApiClientImpl)
    ↓
QuickBooksSyncService
    ↓
QuickBooksTransactionRepository ──→ PostgreSQL (quickbooks_transactions table)
    ↓
DocumentService.createFromExternalData
    ↓
Document + ExtractedData + BankTransaction (same review/approve pipeline as everything else)
```

**Why no SDK dependency**: Intuit publishes `intuit/QuickBooks-V3-Java-SDK` on GitHub, but its own
`pom.xml` has `<distributionManagement>` entirely commented out — it was never actually published to
Maven Central or anywhere else Gradle can resolve. This repo already got bitten once by an unverifiable
pinned SDK version (Square's — see `finance/build.gradle.kts`'s comment on that dependency); rather than
vendor an unpublished SDK from source, the OAuth flow and the one Query API call this integration needs
are hand-rolled with `java.net.http.HttpClient` (built into the JDK) and Jackson (already a project
dependency).

## Key Features

### 1. Idempotent Import
- Uses QuickBooks' Purchase `Id` as `external_id`
- Duplicate imports are automatically skipped
- Safe to re-run sync for the same date range

### 2. Tenant Isolation
- All transactions are scoped to `tenant_id`
- Each business only sees their own QuickBooks data

### 3. Full Analytics Participation
- Unlike Square's sync (which only creates a bare `ExtractedData` row), a QuickBooks purchase always
  has a known category (`AccountRef.name`) and direction (always an expense) — so it also gets a
  `BankTransaction` row (`categoryConfidence = 1.0`), meaning synced expenses show up in category
  breakdowns, anomaly detection, and vendor-rule-adjacent flows the same way a bank-statement-sourced
  transaction does. See `DocumentService.createFromExternalData` and `ExternalDataSeed`.

### 4. No Cents Conversion Needed
- Square amounts arrive in minor units (cents) and need `/100`; QuickBooks' `TotalAmt` is already a
  plain decimal amount — an easy mistake to carry over from the Square pattern by habit, so called out
  explicitly here.

## Setup Instructions

### 1. Get QuickBooks App Credentials

1. Sign up / sign in at the [Intuit Developer Portal](https://developer.intuit.com/app/developer/myapps)
2. Create a new app, select the **QuickBooks Online and Payments** platform
3. Under **Keys & OAuth**, copy the **Client ID** and **Client Secret** — separate values exist for
   **Development** (sandbox) and **Production**; use the ones matching `QUICKBOOKS_ENVIRONMENT`

### 2. Configure Environment

Add to `.env`:

```bash
QUICKBOOKS_ENVIRONMENT=sandbox  # or 'production'
QUICKBOOKS_OAUTH_CLIENT_ID=your_client_id
QUICKBOOKS_OAUTH_CLIENT_SECRET=your_client_secret
# Must exactly match a Redirect URI registered on the app (see below) —
# defaults to this API's own callback route if unset.
QUICKBOOKS_OAUTH_REDIRECT_URI=http://localhost:8080/api/v1/integrations/quickbooks/oauth/callback
```

⚠️ **Never commit real credentials to version control!**

On the [Developer Portal](https://developer.intuit.com/app/developer/myapps), open the app, go to
**Keys & OAuth**, and add the exact same URL under **Redirect URIs** (in the section matching
`QUICKBOOKS_ENVIRONMENT` — Development vs Production redirect URIs are configured separately). Both the
authorize request and the token exchange validate this — a mismatch is the most common cause of the
flow failing right after the user approves access.

### 3. Connect via OAuth (per-tenant, only option)

From the Integrations page, "Connect with QuickBooks" → Intuit's consent screen → redirected back with
`code`, `state`, and `realmId` → exchanged for tokens (`QuickBooksOAuthService`/
`QuickBooksIntegrationController`).

## Usage

### Sync Transactions

```java
@Autowired
private QuickBooksSyncService quickBooksSyncService;

// Sync last 30 days (same window the /sync endpoint uses)
Instant startDate = Instant.now().minus(30, ChronoUnit.DAYS);
Instant endDate = Instant.now();

int imported = quickBooksSyncService.syncTransactions(startDate, endDate);
```

## Data Model

### QuickBooksTransaction

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Internal primary key |
| `tenantId` | UUID | Business owner (tenant isolation) |
| `externalId` | String | QuickBooks' Purchase `Id` (unique) |
| `amount` | BigDecimal | Transaction amount (already decimal, not cents) |
| `currency` | String | ISO currency code |
| `accountName` | String | QuickBooks expense account (`AccountRef.name`) — used as our category |
| `payeeName` | String | Vendor/payee (`EntityRef.name`) |
| `description` | String | `Memo` field |
| `documentId` | UUID | The bridged `Document` this purchase produced |
| `transactionDate` | Instant | `TxnDate` |
| `reconciled` | Boolean | Present for structural parity with `SquareTransaction`; not currently used — QuickBooks is itself the ledger, there's nothing to reconcile *to* |

## Testing

No `QuickBooksSyncServiceTest` exists yet in this repo (unlike `SquareSyncServiceTest`) — add one
following the same `@DataJpaTest` + mocked `QuickBooksApiClient` pattern if you extend this integration.

## Limitations & Future Enhancements

### Current Limitations
- Only syncs **Purchases** (not Bills, Invoices, Deposits, or other transaction types)
- Manual sync only (no webhook support — see below)
- No itemized line items (QuickBooks Purchases do carry a `Line` array; mapping it into
  `ExtractedData.lineItemsJson` is a reasonable follow-up, not built here)

### Planned Features
- [ ] QuickBooks Webhooks for near-real-time updates (Intuit's webhooks are notification-only — they
  tell you *something* changed, not *what*, so a webhook handler still has to re-query the API; not a
  drop-in replacement for polling)
- [ ] Bill / Invoice import
- [ ] Itemized line-item mapping from `Purchase.Line`
- [ ] Scheduled (nightly) sync — deliberately deferred; this repo has no scheduler infrastructure yet
  (no `@EnableScheduling` anywhere), and adding one is a bigger, separate decision that would apply to
  Square too, not just QuickBooks

## Troubleshooting

### `realmId` is missing / null in the callback
- This is QuickBooks-specific — unlike Square's `merchant_id` (returned inside the token exchange
  response body), QuickBooks returns `realmId` as its own query param directly on the OAuth callback
  redirect (`GET /oauth/callback?code=...&state=...&realmId=...`). If it's missing, something upstream
  (a proxy, a manually-constructed test URL) stripped it — check the raw redirect URL in the browser's
  Network tab.

### Sync stops working after ~100 days, or a refresh succeeds once then fails on the next attempt
- **QuickBooks rotates the refresh token on every use.** Each call to the token endpoint with
  `grant_type=refresh_token` returns a *new* refresh token, and the old one is invalidated immediately.
  `QuickBooksSyncService.refreshIfNeeded` persists `refreshed.refreshToken()` (not just the new access
  token) via `tenant.connectQuickbooks(...)` specifically because of this — if that ever gets refactored
  to only save the access token, the very next refresh attempt will fail with an invalid_grant error,
  and the tenant will need to reconnect from scratch. This is a one-way trap: the bug doesn't show up
  until the *second* refresh, well after whoever introduced it has moved on.

### 400/401 calling the Accounting API, but OAuth itself succeeded
- Confirm the **environment** (`QUICKBOOKS_ENVIRONMENT`) matches which app credentials were used to
  connect — unlike the OAuth endpoints (identical for sandbox/production, see below), the Accounting
  *data* API has separate hosts: `sandbox-quickbooks.api.intuit.com` vs `quickbooks.api.intuit.com`. A
  sandbox-issued token against the production host (or vice versa) fails here, not at the OAuth step.
- Confirm the token hasn't expired and wasn't part of a refresh-token-rotation bug (see above).

### General OAuth endpoint reference
Confirmed directly against Intuit's own OAuth discovery documents
(`https://developer.api.intuit.com/.well-known/openid_configuration` and
`.../openid_sandbox_configuration`, which return **identical** values for both environments — the
opposite of Square, where the OAuth host itself changes by environment):
- Authorize: `https://appcenter.intuit.com/connect/oauth2`
- Token: `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
- Revoke: `https://developer.api.intuit.com/v2/oauth2/tokens/revoke`

## Security Considerations

1. **Token Storage (encrypted at rest)**
   - `quickbooks_access_token`/`quickbooks_refresh_token` on `Tenant` are AES-256-GCM encrypted at the
     column level via `AesGcmStringConverter` (`@Convert` on both fields) — required for Intuit's App
     Store security review, which mandates AES/3DES encryption of the refresh token. Unlike Square's
     equivalent tokens (still plaintext `TEXT`, out of scope for this pass — see Square's own docs if
     that integration is ever put through the same review).
   - The AES key (`QUICKBOOKS_TOKEN_ENCRYPTION_KEY`, base64) lives in GCP Secret Manager alongside the
     app's other secrets (`infrastructure/terraform/secrets.tf`), wired into Cloud Run the same way as
     `JWT_SECRET`. Generate one with `openssl rand -base64 32`; never commit a real value.
   - Migration `V18__encrypt_quickbooks_tokens.sql` cleared any tokens stored under the old plaintext
     scheme when this shipped (they can't be read back through the new converter) — any tenant connected
     before that migration needs to reconnect once via "Connect with QuickBooks".
   - `quickbooksRealmId` is left unencrypted — it's Intuit's QuickBooks company ID, not a secret.

2. **Tenant Isolation**
   - Every query enforces `tenant_id` filter, same as Square.

3. **No sensitive data in logs**
   - Intuit's raw HTTP response bodies (token endpoint, revoke endpoint, Query API) are deliberately
     excluded from log lines and exception messages (`QuickBooksOAuthService`, `QuickBooksApiClientImpl`)
     — those bodies can carry token or financial data, and Intuit's review explicitly prohibits logging
     QuickBooks data or credentials. Only status codes are logged.

## References

- [Intuit Developer Portal](https://developer.intuit.com/app/developer/myapps)
- [QuickBooks Online Accounting API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchase)
- [OAuth 2.0 Playground / Discovery docs](https://developer.api.intuit.com/.well-known/openid_configuration)
- [intuit/QuickBooks-V3-Java-SDK](https://github.com/intuit/QuickBooks-V3-Java-SDK) (source reference for entity field names — not a runtime dependency, see above)

---

**Last Updated**: August 2026
**Status**: OAuth + manual sync implemented; not yet verified end-to-end against a real Intuit sandbox app in this environment
**Next**: Verify a real OAuth handshake against a live sandbox app; consider itemized line-item mapping
