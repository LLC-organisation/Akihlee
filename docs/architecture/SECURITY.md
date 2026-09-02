# Security posture (Intuit QuickBooks App Store review)

Notes for whoever answers Intuit's security reviewer, or the next person auditing this repo — points
that are already handled but aren't self-evident from a file scan. QuickBooks-token-specific detail
(encryption, key management) lives in `docs/integrations/QUICKBOOKS.md`; this covers the rest of the
app.

## CSRF

Disabled in `SecurityConfig.filterChain` (`apps/core-api/modules/identity/src/main/java/com/akihlee/identity/SecurityConfig.java`).
This is intentional, not an oversight: the API is stateless Bearer-JWT auth
(`SessionCreationPolicy.STATELESS`) and never sets a session or auth cookie — every request must carry
its own `Authorization` header, explicitly attached by the frontend (`apps/web/src/lib/api-client.ts`).
CSRF exploits a browser's automatic cookie attachment on cross-site requests; with no cookie in the auth
path, there's nothing for a forged request to ride on.

## Session cookies

None exist. The frontend keeps its JWT in `localStorage`, not a cookie — Intuit's cookie
Secure/HttpOnly requirement doesn't apply because there is no session cookie. (The tradeoff — a
`localStorage` token is readable by any script that achieves XSS — is mitigated by the CSP in
`apps/web/next.config.mjs`, which blocks arbitrary inline/remote script execution.)

## TLS

Terminated entirely at the platform edge — Cloud Run (backend) and Vercel (frontend), both of which
enforce modern TLS (1.2+) and never expose a plaintext HTTP listener publicly. The app itself never
handles TLS termination or listens on a public HTTP port.

## TRACE / unused HTTP methods

Not explicitly configured — relies on the embedded Tomcat server's default (`allowTrace=false`), and
Vercel's edge does not forward TRACE either.

## Password storage

BCrypt (`SecurityConfig.passwordEncoder()`), not a custom or reversible scheme.

## Object-level access control

Every tenant-scoped lookup goes through a service method that filters by `tenant_id` before returning
data by ID — e.g. `DocumentService.getDocument` (see the comment on `DocumentController.content`) — so a
guessed/enumerated UUID for another tenant's record resolves to "not found," not a cross-tenant leak.
Admin-only endpoints (`/api/v1/admin/**`) require the `ADMIN` JWT authority.

## Redirects

The only redirect-with-external-input surface is the QuickBooks/Square OAuth callbacks
(`QuickBooksIntegrationController`, `SquareIntegrationController`) — both always redirect to a fixed,
config-defined `app.web-url` with a hardcoded status literal (`connected`/`error`), never to a
caller-supplied URL, so there's no open-redirect surface.

## Sensitive data in URLs

The OAuth callback endpoints receive `code`/`state`/`realmId` as URL params but never render an HTML
body — they always respond with a 302 redirect to the frontend, stripped down to a plain status flag.
No token or code is ever placed in a redirect URL or rendered to the page.
