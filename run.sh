#!/usr/bin/env bash
#
# Start/stop everything needed to run Akihlee locally: infra (Postgres,
# Redis, RabbitMQ, MinIO via Docker Compose), the Core API (Java/Spring
# Boot), and the web frontend (Next.js).
#
# Usage:
#   ./run.sh start
#   ./run.sh stop

set -euo pipefail

# Resolve paths relative to this script's location, so it works no matter
# what directory you invoke it from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_DIR="$SCRIPT_DIR/.run"
CORE_API_PID_FILE="$RUN_DIR/core-api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
CORE_API_LOG="$RUN_DIR/core-api.log"
WEB_LOG="$RUN_DIR/web.log"

CORE_API_PORT=8080
WEB_PORT=3000

# Waits until something is listening on $1 (TCP-connect check, so it works
# regardless of what HTTP status the service returns once it's up).
wait_for_port() {
  local port=$1
  local name=$2
  local tries=0
  until (exec 3<>"/dev/tcp/localhost/$port") 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
      echo "  $name did not come up on :$port within 60s — check its log."
      return 1
    fi
    sleep 1
  done
  exec 3>&- 2>/dev/null || true
  echo "  $name is up on :$port"
}

start() {
  mkdir -p "$RUN_DIR"

  # 1. Infra: Postgres, Redis, RabbitMQ, MinIO (docker-compose.yml only
  #    defines these — the app processes themselves run natively below).
  echo "Starting infrastructure (Postgres, Redis, RabbitMQ, MinIO)..."
  (cd "$SCRIPT_DIR/infrastructure/docker" && docker compose up -d)

  # Core API runs Flyway migrations on startup and will fail fast if
  # Postgres isn't accepting connections yet, so wait for its healthcheck.
  echo "Waiting for Postgres to become healthy..."
  tries=0
  until [ "$(docker inspect --format='{{.State.Health.Status}}' akihlee-postgres 2>/dev/null)" = "healthy" ]; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
      echo "  Postgres never became healthy — check 'docker compose logs postgres'."
      break
    fi
    sleep 1
  done

  # 2. Core API (Java/Spring Boot). .env is loaded into this process
  #    automatically by modules/app/build.gradle.kts's bootRun task.
  if [ -f "$CORE_API_PID_FILE" ] && kill -0 "$(cat "$CORE_API_PID_FILE")" 2>/dev/null; then
    echo "Core API already running (PID $(cat "$CORE_API_PID_FILE"))."
  else
    echo "Starting Core API..."
    (
      cd "$SCRIPT_DIR/apps/core-api"
      nohup ./gradlew :modules:app:bootRun >"$CORE_API_LOG" 2>&1 &
      echo $! >"$CORE_API_PID_FILE"
    )
  fi

  # 3. Web frontend (Next.js dev server).
  if [ -f "$WEB_PID_FILE" ] && kill -0 "$(cat "$WEB_PID_FILE")" 2>/dev/null; then
    echo "Web frontend already running (PID $(cat "$WEB_PID_FILE"))."
  else
    echo "Starting web frontend..."
    (
      cd "$SCRIPT_DIR/apps/web"
      nohup npm run dev >"$WEB_LOG" 2>&1 &
      echo $! >"$WEB_PID_FILE"
    )
  fi

  echo ""
  echo "Waiting for services to respond..."
  wait_for_port "$CORE_API_PORT" "Core API" || true
  wait_for_port "$WEB_PORT" "Web frontend" || true

  echo ""
  echo "Done."
  echo "  Web:      http://localhost:$WEB_PORT"
  echo "  Core API: http://localhost:$CORE_API_PORT"
  echo "  Logs:     $CORE_API_LOG"
  echo "            $WEB_LOG"
}

stop() {
  # npm/gradlew's own PID is just a wrapper process that doesn't forward
  # signals to the actual server it spawns, so kill by the port each
  # service listens on instead of by the recorded PID.
  echo "Stopping web frontend (:$WEB_PORT)..."
  lsof -ti:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill || true
  rm -f "$WEB_PID_FILE"

  echo "Stopping Core API (:$CORE_API_PORT)..."
  lsof -ti:"$CORE_API_PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill || true
  rm -f "$CORE_API_PID_FILE"

  # Stop (not "down"): keeps containers/volumes so local data survives
  # between runs, just frees the ports and CPU.
  echo "Stopping infrastructure containers..."
  (cd "$SCRIPT_DIR/infrastructure/docker" && docker compose stop)

  echo "Done."
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *)
    echo "Usage: $0 {start|stop}"
    exit 1
    ;;
esac
