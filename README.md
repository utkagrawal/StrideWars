# StrideWars 🏃‍♂️⚔️

**A competitive running platform where you capture geographic territories by running through them and battle for supremacy on global leaderboards.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Leaflet (maps) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (via `pg`) |
| Cache / Pub-Sub | Redis (via `ioredis`) |
| Infrastructure | Docker, Docker Compose |

### Architecture

**Modular Monolith** — a single Express application internally split into domain modules:
`auth`, `users`, `runs`, `territories`, `leaderboards`, `social`, `notifications`

See [`docs/architecture.md`](docs/architecture.md) for details and [`docs/decisions.md`](docs/decisions.md) for the rationale.

---

## Repository Layout

```
stridewars/
├── backend/          # Express + TypeScript API server
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── middleware/
│   │   └── modules/
│   │       ├── auth/
│   │       ├── users/
│   │       ├── runs/
│   │       ├── territories/
│   │       ├── leaderboards/
│   │       ├── social/
│   │       └── notifications/
│   └── ...
├── frontend/         # React + TypeScript SPA
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   └── hooks/
│   └── ...
└── docs/             # Architecture & design docs
```

---

## How to Run

> **Prerequisites**: Node.js ≥ 20, Docker Desktop running.

### 1. Install dependencies

```bash
# From the repo root
npm install          # installs root + all workspace deps
```

### 2. Start infrastructure (Postgres + Redis)

```bash
docker compose up -d
```

_(Docker Compose file will be added in Phase 2.)_

### 3. Backend dev server

```bash
cd backend
npm run dev          # ts-node + nodemon on :3001
```

### 4. Frontend dev server

```bash
cd frontend
npm run dev          # Vite on :5173
```

### 5. Run backend tests

```bash
cd backend
npm test
```

### 6. Run linter

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

---

## Phase Roadmap

| Phase | Scope |
|---|---|
| 1 ✅ | Monorepo scaffold, health check |
| 2 | Database schema, migrations |
| 3 | Auth (JWT) |
| 4 | Run recording & storage |
| 5 | Territory capture algorithm |
| 6 | Leaderboards |
| 7 | Social (follow, feed) |
| 8 | Notifications |
| 9 | Real-time (WebSockets) |
| 10–15 | Performance, scaling, polish |

---

## Contributing

See [`docs/decisions.md`](docs/decisions.md) for architectural decisions and rationale.
