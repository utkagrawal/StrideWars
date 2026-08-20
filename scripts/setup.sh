#!/bin/bash
set -e

echo "🚀 Starting StrideWars local development setup..."

echo "1️⃣ Bringing up Docker Compose stack..."
docker compose up -d

echo "2️⃣ Waiting for PostgreSQL to be healthy..."
# We wait for up to 30 seconds for the postgres container healthcheck to pass
for i in {1..30}; do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' stridewars_postgres)" == "healthy" ]; then
    echo "✅ PostgreSQL is healthy!"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "❌ PostgreSQL failed to become healthy in time."
    exit 1
  fi
done

echo "3️⃣ Running database migrations..."
npm run migrate:up --workspace=backend

echo "4️⃣ Seeding the database with realistic data..."
npm run db:seed --workspace=backend

echo ""
echo "🎉 Setup Complete!"
echo "========================================="
echo "📍 Frontend: http://localhost:5173"
echo "📍 Backend API: http://localhost:3000/api"
echo "========================================="
echo "Logs: docker compose logs -f"
echo "To shut down: docker compose down"
