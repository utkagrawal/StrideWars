# Architecture

## Overview

StrideWars is a **modular monolith**: a single deployable Express application internally divided into bounded domain modules. Each module has its own routes, controller and service (`<module>.routes.ts`, `<module>.controller.ts`, `<module>.service.ts`), and modules only call each other through service functions. It's one thing to deploy, but the boundaries are clear enough to split out later.

## Module Boundaries

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, JWT issuance & refresh |
| `users` | User profile CRUD, settings |
| `runs` | Run recording, GPS track storage |
| `territories` | Geographic tile ownership & capture |
| `leaderboards` | Area rankings in Redis sorted sets, global and per region |
| `social` | Follow graph, activity feed |
| `notifications` | "You lost ground" alerts (created by the background worker) |

## Request Flow

```
Client → HTTP → Express Router
                  └── Module Router
                        └── Controller (HTTP parsing)
                              └── Service (business logic, SQL and Redis calls)
```

## Infrastructure

- **PostgreSQL**: primary relational store
- **Redis**: leaderboard sorted sets, a short leaderboard cache, rate-limit counters
- **Docker Compose**: `docker-compose.yml` runs the whole stack (Postgres, PgBouncer, Redis, API, worker, frontend); for day-to-day work I usually run only Postgres and Redis in Docker and the apps on the host, as below

## Local Development Environment

### What runs in Docker

| Service | Image | Port | Why containerised |
|---|---|---|---|
| PostgreSQL | `postgres:16` | `5432` | Ensures everyone uses the same server version; avoids system Postgres conflicts |
| Redis | `redis:7` | `6379` | Same rationale; ensures consistent Redis version across all machines |

### What runs on the host (npm run dev)

| Process | Location | Port | Why on host |
|---|---|---|---|
| Express backend | `backend/` | `3001` | Fast ts-node/nodemon reload; no Docker rebuild cycle during development |
| Background worker | `backend/` | none | Turns queued jobs into "you lost ground" alerts (`npm run worker:dev`) |
| React frontend | `frontend/` | `5173` | Vite HMR requires direct filesystem access; `/api` is proxied to `:3001` |

### Why this split?

Keeping the backend and frontend on the host while only containerising stateful services gives the best developer experience:

- **Sub-second reload**: nodemon + ts-node restarts in < 1 s; a Docker restart cycle takes 5–10 s
- **Debugger attach**: `node --inspect` works trivially on the host; port-forwarding inside Docker adds friction
- **Stateful services need isolation**: Postgres and Redis hold data that must persist across restarts and be version-pinned; running them locally risks version drift across machines

### How to start everything

```bash
# 1. Start infra (from repo root)
npm run infra:up

# 2. Start backend (separate terminal)
cd backend && npm run dev

# 3. Start the worker (separate terminal)
cd backend && npm run worker:dev

# 4. Start frontend (separate terminal)
cd frontend && npm run dev

# 5. Verify
curl http://localhost:3001/api/health
# → { "status": "ok", "db": "ok", "redis": "ok" }
```

### Apple Silicon / M-series note

`postgres:16` and `redis:7` pull `arm64` variants automatically from Docker Hub when Docker Desktop is configured for Apple Silicon. No manual action is required. If you see `WARNING: The requested image's platform does not match the detected host platform`, your Docker installation is using x86 emulation. Open Docker Desktop → Settings → General and ensure "Use Rosetta for x86/amd64 emulation" is **not** the only option selected, or reinstall Docker Desktop with the Apple Silicon package.
