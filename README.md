# StrideWars 🏃‍♂️⚔️
![CI Status](https://github.com/utkagrawal/StrideWars/actions/workflows/ci.yml/badge.svg)

**A competitive running platform where you capture geographic territories by running through them and battle for supremacy on global leaderboards.**

---

## Project Overview

StrideWars is a full-stack, map-based application that gamifies running. By uploading GPS tracks of their runs, users compute the geographic bounding boxes they intersected and claim them as their own. When users intersect a territory owned by someone else, they steal it!

## Features

- **Authentication**: JWT-based secure user registration and login with robust server-side revocation.
- **Run Tracking**: Upload GPS run data and visualize routes using Douglas-Peucker simplification on an interactive Leaflet map.
- **Territory Capture**: Automatically compute geohash cells intersected by your run and claim them using deterministic database locks to ensure concurrency safety.
- **Global Leaderboards**: Live `O(log N)` leaderboard rankings backed by Redis Sorted Sets based on territory ownership.
- **Social Feed**: Follow other runners and see a merged, keyset-paginated feed of their recent runs and territory captures.
- **Background Notifications**: Get notified asynchronously when someone steals your territory, powered by a custom PostgreSQL background worker using `FOR UPDATE SKIP LOCKED`.
- **Interactive Map Landing**: Immediately jump into the action on login with a live map featuring a collapsible HUD containing your global rank, territory count, and alerts.
- **Security Hardened**: Robust input validation with `express-validator`, resource ownership verification middleware, and Redis-backed fixed-window rate limiting.
- **Production Ready**: Fully profiled with native `EXPLAIN ANALYZE`, caching protections against stampedes, connection pool tuning, and multi-stage Docker builds.

### Phases
- [x] Phase 19: Narrative Arc & UX Polish
- [x] Phase 20: Map Centering, Real Polygons, and Demo Seeding
- [x] Phase 21: Realistic Loop Generation & Map UX Polish

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite | Fast, typed SPA experience with Leaflet for geospatial visualization. |
| **Backend** | Node.js, Express, TypeScript | Lightweight asynchronous I/O perfect for high-throughput API endpoints. |
| **Database** | PostgreSQL 16 (via `pg`) | Relational integrity for user data + powerful indexing for geospatial queries. |
| **Cache / Queue** | Redis 7 (via `ioredis`) | Blazing fast `O(log N)` Sorted Sets for leaderboards and Pub/Sub for rate limiting. |
| **Infrastructure** | Docker, Docker Compose | Consistent environments across development, testing, and production. |

### Architecture

**Modular Monolith**: A single Express application internally split into domain modules:
`auth`, `users`, `runs`, `territories`, `leaderboards`, `social`, `notifications`

This structure allows us to move fast with a single deployment while maintaining the strict boundaries required to easily extract microservices in the future.

See [`docs/architecture.md`](docs/architecture.md) for details.

---

## Local Development & Setup

> **Prerequisites**: Node.js ≥ 20, Docker Desktop running.

We provide a one-click bootstrap script that brings up the entire stack, runs migrations, and seeds the database with 50,000 runs to demonstrate scale (and generates demo users with captured territories around IIT Guwahati).

```bash
# 1. Clone and install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env
cp backend/.env.example backend/.env

# 3. Bootstrap the entire environment
npm run setup
```

Once the setup script finishes, you can access the application:
- **Frontend Map**: `http://localhost:5173`
- **Backend API**: `http://localhost:3000/api`

### Infrastructure Commands
- `docker compose up -d` — Start the full local stack (Postgres, Redis, Backend, Worker, Frontend).
- `docker compose -f docker-compose.prod.yml up -d` — Start the production-optimized stack using multi-stage builds and Nginx.
- `npm run infra:down` — Stop containers.

---

## Documentation

StrideWars was built with a strong emphasis on architectural documentation and evidence-based performance profiling.

- 🏗️ **[Architecture Overview](docs/architecture.md)**
- 💾 **[Database Schema & Index Justifications](docs/database.md)**
- 🔌 **[API Documentation](docs/api.md)**
- 🚀 **[Scalability Path & Bottlenecks](docs/scalability.md)**
- 🧮 **[Data Structures & Algorithms (DSA)](docs/dsa.md)**
- 🏛️ **[Architectural Decision Records (ADRs)](docs/decisions.md)**
- 🎓 **[Interview Preparation](docs/interview-prep.md)**

---

## Screenshots (Placeholder)

*(Insert screenshots of the Dashboard, Map View, Leaderboard, and Record Run pages here)*

---

## Future Improvements

As detailed in `docs/scalability.md`, the next logical steps for scaling the platform are:
1. **CDN Caching**: Offload React bundles to Cloudflare.
2. **Read Replicas**: Offload `GET /api/runs` and `GET /api/territories` to Postgres replicas.
3. **PgBouncer**: Implement connection pooling to allow horizontal scaling of the Node.js API pods.
4. **BullMQ**: Migrate the background worker from Postgres `jobs` to a dedicated Redis queue.
