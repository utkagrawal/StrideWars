#!/usr/bin/env bash
# scripts/infra-up.sh
# ─────────────────────────────────────────────────────────────────────────────
# Starts the StrideWars infrastructure containers (Postgres + Redis) and waits
# until both Docker healthchecks report "healthy" before exiting.
#
# Usage:
#   ./scripts/infra-up.sh          (from repo root)
#   npm run infra:up               (via package.json)
#
# Prerequisites:
#   - Docker Desktop must be running
#   - A .env file must exist at the repo root (copy from .env.example)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Resolve repo root regardless of where this script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# ── Preflight checks ──────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Please install Docker Desktop." >&2
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "❌ Docker daemon is not running. Please start Docker Desktop." >&2
  exit 1
fi

if [[ ! -f ".env" ]]; then
  echo "⚠️  No .env file found at repo root."
  echo "   Copying .env.example → .env (you should review and edit it)."
  cp .env.example .env
fi

# ── Start services ────────────────────────────────────────────────────────
echo "🐳 Starting Postgres and Redis..."
docker compose up -d postgres redis

# ── Wait for healthy status ───────────────────────────────────────────────
TIMEOUT=60
ELAPSED=0
INTERVAL=3

wait_healthy() {
  local service="$1"
  while true; do
    local status
    status=$(docker compose ps --format json "$service" 2>/dev/null \
      | python3 -c "import sys,json; data=sys.stdin.read().strip(); rows=data.splitlines(); print(json.loads(rows[0]).get('Health','')) if rows else print('')" 2>/dev/null || echo "")

    if [[ "$status" == "healthy" ]]; then
      return 0
    fi

    if (( ELAPSED >= TIMEOUT )); then
      echo "❌ Timed out waiting for $service to become healthy." >&2
      docker compose logs "$service" | tail -20 >&2
      exit 1
    fi

    printf "   ⏳ Waiting for %s (%ss)...\r" "$service" "$ELAPSED"
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
  done
}

echo "⏳ Waiting for Postgres to be healthy..."
ELAPSED=0
wait_healthy postgres
echo "✅ Postgres is healthy"

echo "⏳ Waiting for Redis to be healthy..."
ELAPSED=0
wait_healthy redis
echo "✅ Redis is healthy"

echo ""
echo "✅ Infrastructure ready!"
echo "   Postgres : localhost:${POSTGRES_PORT:-5432}"
echo "   Redis    : localhost:${REDIS_PORT:-6379}"
echo ""
echo "   Start the backend:  cd backend && npm run dev"
echo "   Start the frontend: cd frontend && npm run dev"
