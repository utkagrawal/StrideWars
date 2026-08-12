# Architectural Decisions

A record of significant technical choices, their rationale, and the alternatives considered.

---

## ADR-001 — TypeScript for Both Frontend and Backend

**Date**: Phase 1  
**Status**: Accepted

### Context

We needed to choose a language for both the React frontend and the Node.js/Express backend. JavaScript was the obvious baseline; TypeScript was the alternative.

### Decision

Use **TypeScript** for both `frontend/` and `backend/`.

### Rationale

1. **End-to-end type safety** — Shared type definitions (e.g., API response shapes, domain models) can eventually be extracted into a shared `packages/types` workspace package, eliminating drift between client and server contracts.
2. **Early error detection** — TypeScript catches entire classes of runtime bugs (null dereferences, wrong property names, incorrect function signatures) at compile time, which is critical for a complex domain like geospatial territory capture.
3. **Developer experience** — IDE autocompletion and refactoring tools work dramatically better with TypeScript, improving velocity across all 15 build phases.
4. **Industry standard** — TypeScript is the de-facto standard for production Node.js and React projects; the ecosystem (DefinitelyTyped, framework typings) is mature.
5. **Onboarding** — New contributors encounter self-documenting code without needing to read separate documentation for function signatures.

### Alternatives Considered

- **Plain JavaScript** — Faster to write initially but accumulates type-related debt rapidly; not suitable for a project with complex domain logic spanning 7 modules.
- **Go for backend** — Explicitly excluded by project requirements.

---

## ADR-002 — Modular Monolith over Microservices

**Date**: Phase 1  
**Status**: Accepted

### Context

We needed to decide the service decomposition strategy for StrideWars.

### Decision

Use a **modular monolith**: one Express application with internal module boundaries (`auth`, `users`, `runs`, `territories`, `leaderboards`, `social`, `notifications`). Each module owns its own routes, controller, service, and repository — but all run in a single process.

### Rationale

1. **Operational simplicity** — One process to deploy, monitor, and debug. No service mesh, no distributed tracing infrastructure required in early phases.
2. **Transactional integrity** — Territory capture, leaderboard updates, and notification dispatch can participate in a single Postgres transaction. This is extremely hard to achieve across microservices.
3. **Refactoring speed** — Cross-cutting changes (e.g., adding a `userId` field to multiple modules) require a single PR instead of coordinated multi-repo changes.
4. **Extractability** — Because modules share no in-process state (all shared state is in Postgres or Redis), any module can be extracted into an independent service later if a specific bottleneck justifies it. The modular monolith is an *evolutionary* architecture.
5. **Team size** — At the current scale, the coordination overhead of microservices (API versioning, contract testing, independent CI pipelines) exceeds the benefits.

### Alternatives Considered

- **Microservices from day 1** — Would introduce distributed systems complexity (network latency, eventual consistency, service discovery) before product-market fit is established. Explicitly excluded by project requirements.
- **Serverless functions** — Poor fit for stateful, long-running workloads like GPS track processing and WebSocket connections (Phase 9).

---

## ADR-003 — PostgreSQL as Primary Database

**Date**: Phase 1  
**Status**: Accepted

### Decision

Use **PostgreSQL** with the `pg` npm client.

### Rationale

- ACID compliance for financial-grade data integrity
- **PostGIS extension** for native geospatial queries (territory polygon intersections, proximity search)
- Mature Node.js ecosystem, excellent JSON column support for semi-structured data
- Redis Sorted Sets complement Postgres for leaderboard hot-path reads

---

## ADR-004 — Redis for Caching and Real-Time Features

**Date**: Phase 1  
**Status**: Accepted

### Decision

Use **Redis** via `ioredis`.

### Rationale

- Sorted Sets are the natural data structure for leaderboards (O(log N) updates, O(log N + M) range queries)
- Pub/Sub channel support for real-time notifications (Phase 8–9)
- Session / token caching reduces Postgres load on authenticated routes
- `ioredis` has excellent TypeScript support and cluster-mode compatibility for future scaling
