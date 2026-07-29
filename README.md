# Akihlee - AI Finance OS for SMEs

AI-powered financial intelligence, accounting, and CFO automation platform for small and medium businesses.

## 🏗️ Project Structure

```
akihlee/
├── apps/
│   ├── core-api/           # Java 21 + Spring Boot - Core backend
│   │   ├── modules/
│   │   │   ├── identity/   # Tenant & multi-tenancy
│   │   │   ├── documents/  # Document capture & storage
│   │   │   ├── ledger/     # Double-entry bookkeeping
│   │   │   ├── finance/    # Finance core (planned)
│   │   │   └── app/        # Main Spring Boot application
│   │   └── build.gradle.kts
│   ├── document-worker/    # Python + FastAPI - OCR & extraction
│   │   ├── app/
│   │   │   ├── services/   # OCR, queue consumer
│   │   │   └── routers/    # Health checks, APIs
│   │   └── pyproject.toml
│   └── web/                # Next.js 14 + TypeScript - Frontend
│       ├── src/
│       │   ├── app/        # App router pages
│       │   ├── components/ # React components
│       │   └── lib/        # API client utilities
│       └── package.json
├── infrastructure/
│   ├── docker/             # Docker Compose for local dev
│   │   └── docker-compose.yml
│   └── terraform/          # IaC (planned)
└── docs/
    ├── architecture/       # Architecture documentation
    └── adr/                # Architecture decision records
```

## 🚀 Quick Start

### Prerequisites

- **Java 21** (for Core API)
- **Python 3.11+** (for Document Worker)
- **Node.js 18+** & npm (for Frontend)
- **Docker & Docker Compose** (for local infrastructure)

### 1. Start Infrastructure Services

```bash
cd infrastructure/docker
docker compose up -d

# Verify all services are healthy
docker compose ps
```

This starts:
- PostgreSQL (port 5432) - Database
- Redis (port 6379) - Cache
- RabbitMQ (ports 5672, 15672) - Message queue
- MinIO (ports 9000, 9001) - S3-compatible storage

### 2. Run Core API (Java/Spring Boot)

```bash
cd apps/core-api

# Copy environment variables
cp ../../.env.example ../../.env

# Build and run
./gradlew :modules:app:bootRun
```

API will be available at: http://localhost:8080

### 3. Run Document Worker (Python/FastAPI)

```bash
cd apps/document-worker

# Install dependencies
pip install -e .

# Run worker
uvicorn app.main:app --reload --port 8001
```

Worker will be available at: http://localhost:8001

### 4. Run Frontend (Next.js)

```bash
cd apps/web

# Install dependencies
npm install

# Run dev server
npm run dev
```

Frontend will be available at: http://localhost:3000

## 🧪 Running Tests

### Java Tests (Core API)

```bash
cd apps/core-api

# Run all tests
./gradlew test

# Run specific module tests
./gradlew :modules:documents:test

# Note: Testcontainers requires Docker to be running
```

### Python Tests (Document Worker)

```bash
cd apps/document-worker

# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest
```

## 📋 Current Features (MVP Phase 1)

### ✅ Implemented

- **Multi-tenant architecture** with tenant isolation at database level
- **Document upload** with S3/MinIO storage
- **Tracer bullet test** for tenant-isolated document upload
- **Docker Compose** for local development infrastructure
- **FastAPI worker** scaffolding for OCR processing
- **Next.js frontend** with dashboard UI

### 🚧 In Progress

- Document OCR extraction pipeline
- RabbitMQ event-driven processing
- Double-entry ledger module

### 📅 Planned

- M-Pesa Daraja integration
- Plaid API integration (US banks)
- AI CFO recommendations
- Financial reports (P&L, Balance Sheet, Cash Flow)

## 🔐 Security

### Tenant Isolation

Every database record carries a `tenant_id` enforced at the query level:

```java
// Documents can only be accessed by their owner tenant
Optional<Document> findByIdAndTenantId(UUID id, UUID tenantId);
```

Thread-local `TenantContext` ensures tenant ID is available throughout the request lifecycle.

### Data Protection (Kenya DPA Compliance)

For Kenya market, implement **tokenized hub-and-spoke model**:
- PII stored in Kenya VPS
- Tokenized data processed in AWS
- See `docs/architecture/compliance.md` for details (planned)

## 🏛️ Architecture Principles

1. **Modular Monolith** → Microservices later (avoid premature fragmentation)
2. **Tenant Isolation** → Every record scoped to tenant_id
3. **Event-Driven** → Async processing via RabbitMQ
4. **Test-Driven** → Write tests first, implement to pass
5. **API-First** → REST APIs with OpenAPI contracts
6. **Immutable Ledger** → Financial journal entries are append-only

## 📖 API Documentation

Once running, API docs available at:
- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI spec: http://localhost:8080/v3/api-docs

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Java 21, Spring Boot 3.3, Spring Data JPA |
| **Worker** | Python 3.11, FastAPI, Tesseract OCR |
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS |
| **Database** | PostgreSQL 16 |
| **Cache** | Redis 7 |
| **Queue** | RabbitMQ 3.13 |
| **Storage** | MinIO (S3-compatible) |
| **Build** | Gradle 8.9, npm |

## 🐛 Troubleshooting

### Testcontainers fails with "Docker not running"

Ensure Docker daemon is running:
```bash
docker ps  # Should list running containers
```

If Docker isn't available, configure tests to use H2 in-memory database instead.

### RabbitMQ connection refused

Check RabbitMQ is running:
```bash
docker compose ps rabbitmq
```

Access management UI: http://localhost:15672 (credentials in `.env`)

### MinIO bucket not found

Re-run bucket initialization:
```bash
docker compose up minio-init
```

## 📚 Documentation

- [Solution Architecture Document](Akihlee_Solutions_Architecture_Document.pdf)
- [STRIDE Threat Model](docs/architecture/threat-model.md) (planned)
- [Infrastructure Guide](infrastructure/docker/README.md)

## 🤝 Contributing

This is a team project. Before starting development:

1. Read the [Architecture Document](Akihlee_Solutions_Architecture_Document.pdf)
2. Follow TDD principles - write tests first
3. Ensure all tests pass before committing
4. Use conventional commit messages

## 📝 License

Proprietary - All rights reserved

---

**Status**: 🟡 MVP Development in Progress  
**Current Phase**: Phase 1 - Document Capture MVP  
**Last Updated**: July 2026
