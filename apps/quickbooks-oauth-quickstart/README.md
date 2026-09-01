# QuickBooks OAuth 2.0 Quickstart (sandbox)

A small, standalone Spring Boot app implementing the `authorization_code`
flow against the QuickBooks Online sandbox, plus three read calls (company
info, transactions, user info) and token refresh. Endpoints and field names
below are verified against Intuit's own docs/SDKs, not guessed — see the
source comments for the specific reference each one came from.

## What changed from the original ask

- **Dropped the `com.intuit.quickbooks.payment` scope and the Payments
  "create a charge" call.** You confirmed this app only needs to pull
  transactions for financial visibility, not process cards — so Step 3
  below is company info + a transactions query instead of a charge. If you
  do need Payments later, that's a separate scope + a separate API host
  (`sandbox.api.intuit.com/quickbooks/v4/payments/...`) with its own PCI
  considerations around raw card data — worth a fresh look at that point
  rather than bolting it on now.

## 1. Set up your secret

```bash
cd apps/quickbooks-oauth-quickstart
cp .env.example .env
# edit .env, paste your real client secret from
# https://developer.intuit.com/app/developer/myapps -> your app -> Keys & OAuth
```

`.env` is gitignored. Never put the secret in `application.properties` or commit it.

## 2. Run it

```bash
set -a && source .env && set +a
mvn spring-boot:run
```

Open **http://localhost:8090**.

## 3. Walk through the flow

The page at `/` has a button for each step:

1. **Connect** (`GET /connect`) — redirects your browser to Intuit's
   consent screen, where you pick a sandbox company to authorize against.

2. **Paste back code / realmId / state** (`POST /exchange`) — here's the
   one real deviation from a typical setup: your `redirect_uri` is
   `https://developer.intuit.com/app/developer/quickstart`, which is
   **Intuit's own hosted page**, not a route this app serves. After you
   consent, Intuit sends the browser there instead of back to
   `localhost:8090`, and that page *displays* `code`, `realmId`, and
   `state` on screen for manual copy-paste (that's literally what it's
   for — the Quickstart flow before you've stood up your own callback
   route). Copy those three values into the form on `/` and submit it;
   the app validates `state` against what `/connect` generated (CSRF
   protection — don't skip this check) and exchanges `code` for tokens.

   Once you're ready to stop copy-pasting, register your own redirect URI
   (e.g. `http://localhost:8090/callback`) on the app's Keys & OAuth page
   and point `QUICKBOOKS_REDIRECT_URI` at it — then it's a straightforward
   `@GetMapping("/callback")` reading `code`/`realmId`/`state` as query
   params instead of a pasted form, no code changes needed beyond that.

3. **Call the APIs** (`GET /api/company-info`, `GET /api/transactions`,
   `GET /api/user-info`) — each one refreshes the access token first if
   it's within 60s of expiring (or already expired), so you never have to
   think about it manually. `/api/transactions` defaults to
   `SELECT * FROM Purchase MAXRESULTS 50`; pass `?entity=Deposit` or any
   other queryable entity to pull a different transaction type — see
   [the Accounting API's entity reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchase)
   for the full list and field shapes.

4. **Refresh** (`POST /refresh`) — forces a refresh on demand, useful for
   testing. Refresh tokens rotate on every use (Intuit invalidates the old
   one) — the response's new `refresh_token` is what gets persisted, not
   just a new `access_token`. If you skip persisting it and reuse a stale
   refresh token, the next refresh fails.

   **Disconnect** (`POST /disconnect`) — revokes the token with Intuit and
   clears local storage. Not one of the four requested steps, but the
   natural way to cleanly end a session rather than just deleting the
   token file.

## Where tokens live

`tokens.local.json` in this directory (path configurable via
`QUICKBOOKS_TOKEN_STORE_PATH`), gitignored. This is a single-slot store —
fine for one developer against one sandbox company. A real multi-tenant
app needs this keyed by user/tenant in a real database, encrypted at rest,
not a flat file (see `TokenStore.java`'s class comment).

## Error handling

Every Intuit call goes through `IntuitOAuthClient`/`AccountingApiClient`/
`UserInfoClient`, which throw `IntuitApiException` on any non-2xx response
carrying Intuit's real HTTP status and response body untouched — a
`@RestControllerAdvice` (`ApiExceptionHandler`) turns that into a clean
JSON error instead of a stack trace. Intuit's error shapes differ per API
(OAuth: `{"error": "...", "error_description": "..."}`; Accounting API:
`{"Fault": {"Error": [...]}}`) — rather than guess a merged shape, the raw
body is passed through so you see exactly what Intuit sent.

## Endpoints this app calls (all verified, sources in code comments)

| Purpose | Method + URL |
|---|---|
| Authorize | `GET https://appcenter.intuit.com/connect/oauth2` |
| Token exchange / refresh | `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Revoke | `POST https://developer.api.intuit.com/v2/oauth2/tokens/revoke` |
| Company info (sandbox) | `GET https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/companyinfo/{realmId}` |
| Transactions query (sandbox) | `GET https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/query?query=SELECT+*+FROM+Purchase...` |
| User info (sandbox) | `GET https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo` |

Only the Accounting/OpenID *data* API hosts change between sandbox and
production (`sandbox-quickbooks.api.intuit.com` → `quickbooks.api.intuit.com`,
`sandbox-accounts.platform.intuit.com` → `accounts.platform.intuit.com`) —
the OAuth authorize/token/revoke endpoints themselves are identical in both
environments (see `IntuitOAuthClient`'s class comment).

Reference: [Intuit OAuth 2.0 docs](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
