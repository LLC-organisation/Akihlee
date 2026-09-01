# Akihlee Local Development Infrastructure

Docker Compose setup for local development environment.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5434 | Transactional database |
| Redis | 6380 | Cache & session store |
| Pub/Sub emulator | 8085 | Local stand-in for GCP Pub/Sub (core-api publishes here) |
| Pub/Sub forwarder | — | Forwards emulator messages to document-worker as HTTP push (the emulator itself only supports pull) |
| MinIO | 9000, 9001 | Object storage (S3-compatible) |

> **Credentials**: See `../../.env.example` for default development credentials.

## Quick Start

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v
```

## Service URLs

- **PostgreSQL**: `jdbc:postgresql://localhost:5434/akihlee_dev`
- **Redis**: `redis://localhost:6380` (password required)
- **Pub/Sub emulator**: `localhost:8085` (set `PUBSUB_EMULATOR_HOST=localhost:8085` for anything running natively on the host, e.g. core-api)
- **MinIO Console**: http://localhost:9001

## Health Checks

```bash
# Check all services are healthy
docker compose ps

# Test PostgreSQL connection
psql -h localhost -U akihlee -d akihlee_dev

# Test Redis connection
redis-cli -a <REDIS_PASSWORD> ping

# Test MinIO connection
curl http://localhost:9000/minio/health/live
```

## Pre-created MinIO Buckets

- `documents` - Receipt/invoice storage (private)
- `exports` - Generated reports (public download)

## Environment Variables for Application

Copy `../../.env.example` to `../../.env` and configure with your credentials:

```bash
cp ../../.env.example ../../.env
```

See [.env.example](../../.env.example) for all available configuration options.

## Security Note

⚠️ **These credentials are for LOCAL DEVELOPMENT ONLY.**  
Never use these in staging or production environments.
