# Architecture

> **Status**: Updated in Phase 1.5 — local dev environment section added.

## Overview

StrideWars is a **modular monolith**: a single deployable Express application internally divided into bounded domain modules. Each module owns its routes, controller, service, and repository layer — enforcing separation of concerns without the operational overhead of microservices.

## Module Boundaries

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, JWT issuance & refresh |
| `users` | User profile CRUD, settings |
| `runs` | Run recording, GPS track storage |
| `territories` | Geographic tile ownership & capture |
| `leaderboards` | Ranking computation, point aggregation |
| `social` | Follow graph, activity feed |
| `notifications` | In-app and push notification dispatch |

## Request Flow

```
Client → HTTP → Express Router
                  └── Module Router
                        └── Controller (HTTP parsing)
                              └── Service (business logic)
                                    └── Repository (DB / Redis)
```

## Infrastructure

- **PostgreSQL** — primary relational store
- **Redis** — caching, leaderboard sorted sets, session store
- **Docker Compose** — local dev orchestration (Postgres + Redis only)

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
| React frontend | `frontend/` | `5173` | Vite HMR requires direct filesystem access |

### Why this split?

Keeping the backend and frontend on the host while only containerising stateful services gives the best developer experience:

- **Sub-second reload** — nodemon + ts-node restarts in < 1 s; a Docker restart cycle takes 5–10 s
- **Debugger attach** — `node --inspect` works trivially on the host; port-forwarding inside Docker adds friction
- **Stateful services need isolation** — Postgres and Redis hold data that must persist across restarts and be version-pinned; running them locally risks version drift across machines

### How to start everything

```bash
# 1. Start infra (from repo root)
npm run infra:up

# 2. Start backend (separate terminal)
cd backend && npm run dev

# 3. Start frontend (separate terminal)
cd frontend && npm run dev

# 4. Verify
curl http://localhost:3001/api/health
# → { "status": "ok", "db": "ok", "redis": "ok" }
```

### Apple Silicon / M-series note

`postgres:16` and `redis:7` pull `arm64` variants automatically from Docker Hub when Docker Desktop is configured for Apple Silicon. No manual action is required. If you see `WARNING: The requested image's platform does not match the detected host platform`, your Docker installation is using x86 emulation — open Docker Desktop → Settings → General and ensure "Use Rosetta for x86/amd64 emulation" is **not** the only option selected, or reinstall Docker Desktop with the Apple Silicon package.

_Detailed diagrams and sequence flows will be added in subsequent phases._
