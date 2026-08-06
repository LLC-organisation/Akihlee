# Akihlee - AI Finance OS for SMEs

AI-powered financial intelligence, accounting, and CFO automation platform for small and medium businesses.

## 🌐 Live Deployment

- **App**: https://akihlee-3uqh.vercel.app
- **Frontend**: Vercel (`apps/web`)
- **Backend**: Render (`apps/core-api`, Docker)
- **Database & Storage**: Supabase (Postgres + S3-compatible bucket storage)
- **Message Queue**: CloudAMQP (managed RabbitMQ)

See [Deploying Your Own Instance](#-deploying-your-own-instance) below to stand up the same setup elsewhere.

## 🏗️ Project Structure

```
akihlee/
├── apps/
│   ├── core-api/           # Java 21 + Spring Boot - Core backend
│   │   ├── modules/
│   │   │   ├── identity/   # Tenants, users, JWT auth, security config
│   │   │   ├── documents/  # Document capture, storage, OCR pipeline,
│   │   │   │               #   WhatsApp/email webhooks, AI CFO placeholder
│   │   │   ├── finance/    # Square POS integration
│   │   │   └── app/        # Main Spring Boot application, config, migrations
│   │   ├── Dockerfile       # For Render (or any container host)
│   │   └── build.gradle.kts
│   ├── document-worker/    # Python + FastAPI - OCR & extraction
│   │   ├── app/
│   │   │   ├── services/   # OCR (Tesseract/pdf2image), RabbitMQ consumer
│   │   │   └── routers/    # Health checks
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   └── web/                # Next.js 14 + TypeScript - Frontend
│       ├── src/
│       │   ├── app/        # App router pages (dashboard, extracted-data,
│       │   │               #   settings, ai-cfo, login, register)
│       │   ├── components/ # React components
│       │   └── lib/        # API client, theme (light/dark) utilities
│       └── package.json
├── infrastructure/
│   └── docker/             # Docker Compose for local infra + document-worker
│       └── docker-compose.yml
├── run.sh                  # ./run.sh start|stop — brings up infra + core-api + web together
├── packages/                # api-contracts, shared-schemas — scaffolded, unused so far
├── tests/                    # ai-evaluations, e2e — scaffolded, no tests yet
└── docs/
    ├── architecture/       # (planned)
    ├── adr/                # (planned)
    └── integrations/       # SQUARE.md
```

> Note: `packages/`, `tests/`, and `docs/architecture|adr` are scaffolded directories with no content yet — they represent intended structure, not implemented work.

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Java 21** (for Core API)
- **Docker & Docker Compose** (for local infra + document-worker)
- **Node.js 18+** & npm (for Frontend)

### The easy way

```bash
cp .env.example .env   # then edit values if needed — defaults work out of the box
./run.sh start         # brings up Postgres, Redis, RabbitMQ, MinIO, document-worker, core-api, and web
./run.sh stop          # stops everything
```

- Web: http://localhost:3000
- Core API: http://localhost:8080

### Manual, piece by piece

**1. Infrastructure** (Postgres, Redis, RabbitMQ, MinIO, and `document-worker` — all via Docker Compose):

```bash
cd infrastructure/docker
docker compose up -d
docker compose ps   # verify all healthy
```

This starts:
- PostgreSQL (port 5434)
- Redis (port 6380)
- RabbitMQ (ports 5672, 15672 management UI)
- MinIO (ports 9000, 9001 console)
- `document-worker` (OCR pipeline consumer — runs in Docker so Tesseract/poppler don't need installing on the host)

**2. Core API** (Java/Spring Boot, run natively for fast iteration):

```bash
cd apps/core-api
./gradlew :modules:app:bootRun
```

`.env` at the repo root is loaded into the process automatically (see `modules/app/build.gradle.kts`) — Spring Boot has no built-in `.env` support otherwise.

API: http://localhost:8080

**3. Frontend** (Next.js):

```bash
cd apps/web
npm install
npm run dev
```

Frontend: http://localhost:3000

## ☁️ Deploying Your Own Instance

The live deployment uses four services. Roughly, in order:

1. **Supabase** — create a project, then get the **Session Pooler** connection string (Project Settings → Database → Connection Pooling → *Session mode*, not Transaction mode — Flyway needs session-level features). Also enable Storage and create `documents`/`exports` buckets (S3-compatible; get an S3 access key/secret under Storage settings).
2. **CloudAMQP** — create a free instance, get the AMQPS host/username/password (port 5671, TLS).
3. **Render** — new Web Service, root directory `apps/core-api` (uses its `Dockerfile`). Set all the env vars below, generating fresh secrets for `JWT_SECRET`/`ENCRYPTION_KEY`/`INTERNAL_API_KEY` — don't reuse the dev placeholders. Also deploy `document-worker` as a Background Worker the same way (root directory `apps/document-worker`), pointed at the same CloudAMQP/Supabase Storage, with `CORE_API_URL` set to the core-api service's Render URL.
4. **Vercel** — new project, root directory `apps/web`, env var `NEXT_PUBLIC_API_URL` pointing at the Render service (`https://<service>.onrender.com/api/v1`).

Key gotchas hit while setting this up (see `.env.example` for the full annotated list):
- `DATABASE_URL` must be `jdbc:postgresql://host:port/db` — not the plain `postgresql://user:pass@host/db` string these dashboards hand you, and never with the credentials embedded or wrapped in quotes (most PaaS dashboards pass env values through literally, quotes included).
- Supabase's **direct** connection host is IPv6-only on most projects — use the Session Pooler instead if your deploy target lacks an IPv6 route.
- A fresh Supabase project's `public` schema isn't "empty" to Flyway (Supabase pre-applies its own default grants) — `spring.flyway.baseline-on-migrate: true` with `baseline-version: "0"` is already configured for this.
- Supabase's pooler caps free-tier projects at a small total connection count shared across every connected instance — `HIKARI_MAX_POOL_SIZE` (default 5) keeps one instance from starving the others out.
- CORS: `CORS_ALLOWED_ORIGINS` must include the deployed frontend's exact origin, or requests fail silently in the browser with no server-side error to grep for.
- In a Vercel monorepo, **Root Directory** must be set explicitly (`apps/web`) or the build silently fails to find the Next.js app.

## 🧪 Running Tests

### Java Tests (Core API)

```bash
cd apps/core-api
./gradlew test
./gradlew :modules:documents:test   # specific module
# Testcontainers requires Docker to be running
```

### Python Tests (Document Worker)

```bash
cd apps/document-worker
pip install -e ".[dev]"
pytest
```

No tests exist yet for the auth, OCR pipeline, or frontend code added since MVP.

## 📋 Current Features

### ✅ Implemented

- **Multi-tenant architecture**, tenant isolation enforced at the query level (`TenantContext` + `tenant_id` on every record)
- **Real JWT authentication** — register/login/change-password, BCrypt password hashing, per-tenant data isolation verified end-to-end
- **Document upload** to S3-compatible storage (Supabase Storage in production, MinIO locally), with a full REST API (`/api/v1/documents`, `/api/v1/auth/*`, `/api/v1/tenant/*`)
- **Async OCR pipeline**: upload → RabbitMQ → `document-worker` (real Tesseract OCR + `pdf2image` for PDFs, regex-based field extraction — no LLM configured) → REST callback → `ExtractedData` table → paginated `/extracted-data` page. This is what will feed the AI CFO.
- **WhatsApp integration via Twilio** — inbound webhook (form-encoded, signature-verified) feeds attached receipts/invoices into the same upload pipeline; outbound replies sent via the Twilio Messages API; needs `TWILIO_*` env vars to actually send/receive
- **Inbound email webhook** — scaffolded around SendGrid Inbound Parse's format; each tenant gets a derived `{tenantId}@{domain}` address (shown in Settings); inert until a domain with MX records pointed at a provider is configured
- **Settings page** — appearance (light/dark, user-toggled), business name, change password, WhatsApp connect/disconnect, email address display
- **Placeholder AI CFO chat page** (`/ai-cfo`) — grounds replies in real `ExtractedData` stats rather than a real LLM (none configured; natural extension point once one is)
- **Square integration** for POS/payment data collection — idempotent sync, cents→decimal conversion, tenant-isolated import, reconciliation tracking
- **Full light/dark theme**, mobile-first responsive UI with a hamburger nav
- **`run.sh`** for one-command local start/stop; Dockerfiles for `core-api` and `document-worker` for container deploys
- Deployed and live (Render + Vercel + Supabase + CloudAMQP — see above)

### 🚧 Known Gaps

- No automated tests for any of the above (auth, OCR pipeline, webhooks, frontend)
- No `spring-boot-starter-actuator` or OpenAPI/Swagger — no `/actuator/health` or API docs endpoint yet
- Double-entry ledger module not started
- Email ingestion needs a real external account (a domain + inbound-parse provider) before it does anything beyond respond to its own verification handshake; WhatsApp needs `TWILIO_AUTH_TOKEN` set to actually send/receive (account SID/number are configured)
- OCR field extraction is regex/heuristic-based, not LLM-based (no `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` configured)

### 📅 Planned

- M-Pesa Daraja integration (Kenya mobile money)
- Plaid API integration (US banks)
- Real AI CFO (LLM-backed predictions, KPIs, financial correspondence)
- Financial reports (P&L, Balance Sheet, Cash Flow)
- Square webhook support (real-time updates)

## 🔐 Security

### Tenant Isolation

Every database record carries a `tenant_id` enforced at the query level:

```java
// Documents can only be accessed by their owner tenant
Optional<Document> findByIdAndTenantId(UUID id, UUID tenantId);
```

Thread-local `TenantContext` makes the tenant ID available throughout the request lifecycle — set by `JwtAuthenticationFilter` from the JWT's claims (not a client-supplied header) for user requests, or resolved by phone/email address for the WhatsApp/email webhooks.

### Authentication

- JWT (HS256), issued on register/login, `Authorization: Bearer` on every subsequent request
- Passwords hashed with BCrypt
- `/api/v1/auth/register` and `/api/v1/auth/login` are the only public endpoints; everything else requires a valid JWT
- Internal service-to-service calls (document-worker's extraction callback) use a separate shared API key, not a user JWT
- CORS origins are explicit (`CORS_ALLOWED_ORIGINS`), not wildcarded

### Data Protection (Kenya DPA Compliance)

For Kenya market, implement **tokenized hub-and-spoke model**:
- PII stored in Kenya VPS
- Tokenized data processed in AWS
- (Planned — not yet designed or implemented)

## 🏛️ Architecture Principles

1. **Modular Monolith** → Microservices later (avoid premature fragmentation)
2. **Tenant Isolation** → Every record scoped to tenant_id
3. **Event-Driven** → Async OCR processing via RabbitMQ (implemented)
4. **API-First** → REST APIs (OpenAPI contracts not yet generated)
5. **Immutable Ledger** → Financial journal entries are append-only (module not yet built)

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Java 21, Spring Boot 3.3, Spring Data JPA, Spring Security, Flyway |
| **Worker** | Python 3.11, FastAPI, Tesseract OCR, pdf2image, aio-pika |
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS |
| **Database** | PostgreSQL (Supabase in production, local Docker for dev) |
| **Object storage** | S3-compatible (Supabase Storage in production, MinIO for dev) |
| **Queue** | RabbitMQ (CloudAMQP in production, local Docker for dev) |
| **Cache** | Redis (provisioned, not yet used by application code) |
| **Auth** | JWT (jjwt), BCrypt |
| **Hosting** | Render (core-api, document-worker), Vercel (web) |
| **Build** | Gradle 8.9, npm |

## 🐛 Troubleshooting

### Testcontainers fails with "Docker not running"

```bash
docker ps  # Should list running containers
```

### RabbitMQ connection refused (local dev)

```bash
docker compose ps rabbitmq
```
Management UI: http://localhost:15672 (credentials in `.env`)

### MinIO bucket not found (local dev)

```bash
docker compose up minio-init
```

### `./gradlew` fails with "Unable to access jarfile gradle-wrapper.jar"

This means `apps/core-api/gradle/wrapper/gradle-wrapper.jar` isn't present — check it's actually committed (`git ls-files | grep gradle-wrapper.jar`). `.gitignore` patterns containing `/` are anchored to the repo root, not matched at any depth, so a naive `!gradle/wrapper/gradle-wrapper.jar` negation silently never matches a nested module's wrapper.

### Deployed app 404s / errors that don't match what you expect locally

Check the deploy platform's **own** environment variables — they're separate from your local `.env` and don't sync automatically. See [Deploying Your Own Instance](#-deploying-your-own-instance) for the gotchas most likely to bite (JDBC URL format, quoting, connection pool limits).

## 📚 Documentation

- [Square Integration Guide](docs/integrations/SQUARE.md)
- [Infrastructure Setup](infrastructure/docker/README.md)
- Architecture docs, ADRs, and a threat model are planned but not yet written

## 🤝 Contributing

This is a team project. Before starting development:

1. Read this README and `.env.example` (annotated with every config gotcha found so far)
2. Ensure all tests pass before committing
3. Use conventional commit messages

## 📝 License

Proprietary - All rights reserved

---

**Status**: 🟢 Deployed, MVP feature set functional end-to-end
**Current Phase**: Phase 1 (Document Capture MVP) complete; early Phase 2 features (WhatsApp/email ingestion scaffolds, AI CFO placeholder) in place pending external service credentials
**Last Updated**: August 2026
