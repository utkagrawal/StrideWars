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

### 6. Background Processing
- **Queue**: Sidekiq/BullMQ (planned)
- **Rationale**: For offloading territory recalculations or push notifications to avoid blocking the API thread.

### 7. Geohashing Precision (Phase 6)
- **Tool**: `ngeohash`
- **Precision**: 7
- **Cell Size**: Roughly 152m x 152m
- **Rationale**:
  - **Precision 6** (~1.2km x 0.6km) is too large; a short 2km run would barely capture 1-2 cells, feeling unrewarding.
  - **Precision 8** (~38m x 19m) is too small; a standard run would generate hundreds of cells, inflating the database table (`territories`) and overwhelming the frontend renderer with tiny DOM elements.
  - **Precision 7** strikes the perfect balance. It provides enough granularity that a neighborhood feels "conquerable" street-by-street, but keeps data volume bounded. 
  - Using geohashing provides a fast O(1) index lookup (`WHERE geohash = ANY($1)`) instead of doing expensive spatial queries (PostGIS) or linear Cartesian distance scans.

### 8. Territory Capture Rules & Concurrency (Phase 7)
- **Rule**: Last Capture Wins
- **Rationale**: Instead of "first come first served," allowing the most recent run to claim ownership keeps the map highly dynamic and competitive. Players can actively steal territories from each other.
- **Concurrency Strategy**: Deterministic Lock Ordering
- **Rationale**: Territory capture is processed synchronously inside a database transaction during run upload. To prevent circular deadlocks between concurrent requests attempting to capture overlapping territories, the unique geohashes are lexicographically sorted before executing `INSERT ... ON CONFLICT DO UPDATE`. This ensures all Postgres connections request row-level locks in identical sequences.

### 9. Leaderboards (Phase 8)
- **Score Definition**: Current territories owned.
- **Rationale**: While total distance run is a good metric, tying the main leaderboard directly to territory ownership encourages users to engage with the competitive map loop (recapturing stolen land) rather than just running isolated loops. 
- **Caching**: 10s JSON TTL on top of Redis ZSETs.
- **Rationale**: While Redis ZSET reads are incredibly fast ($O(\log N)$), hydrating the usernames from Postgres requires a `SELECT` query. To absorb "thundering herds" (e.g. hundreds of users checking the leaderboard simultaneously after receiving a push notification), caching the final JSON payload for 10 seconds prevents identical requests from pounding the Postgres database.

### 10. Background Worker / Queue (Phase 10)
- **Queue Technology**: PostgreSQL `jobs` table instead of BullMQ / Redis / Kafka.
- **Concurrency Pattern**: `FOR UPDATE SKIP LOCKED`.
- **Rationale**: Introducing a dedicated message broker or Redis-backed queue system (like BullMQ) requires managing another moving part and ensuring at-least-once delivery semantics between Postgres transactions and the broker. By inserting into a `jobs` table inside the exact same Postgres transaction that performs the territory capture, we achieve 100% atomic enqueueing. If the transaction rolls back, the notification is never sent. Using `SKIP LOCKED` allows parallel worker instances to safely pop jobs off the queue. We defer BullMQ until throughput demands it.

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

---

## ADR-005 — Infrastructure Setup Split from Schema Design (Phase 1.5 vs. Phase 2)

**Date**: Phase 1.5
**Status**: Accepted

### Context

After establishing the repo scaffold (Phase 1), the next logical steps are:
1. Prove the app can actually reach Postgres and Redis
2. Design and apply the database schema

These could be done in a single phase, but were deliberately separated.

### Decision

Phase 1.5 owns **infrastructure only**: Docker Compose, real connection wiring, and a connectivity-proving health check. Phase 2 owns **schema design only**: DDL, migrations, and the first real data models.

### Rationale

1. **Separation of concerns at the phase level** — Infrastructure validity (can the app connect?) is a different concern from schema correctness (is the data model right?). Mixing them makes failures ambiguous: is the bug in the connection string, the healthcheck query, or the migration SQL?

2. **Fail-fast feedback loop** — By the end of Phase 1.5, every developer can run `npm run infra:up && curl /api/health` and get `{"status":"ok","db":"ok","redis":"ok"}` as a green baseline. Phase 2 schema work then starts from a known-good foundation rather than debugging connection issues mid-migration.

3. **Reduced blast radius** — If Docker image pins or env var naming changes are needed, fixing them in isolation (Phase 1.5) means Phase 2 schema PRs are not polluted with infra churn.

4. **Testability** — Phase 1.5 produces a concrete, testable contract (`/api/health` response shape) that integration tests can assert against. Phase 2 can then add schema-level tests on top of a stable infra layer.

### Alternatives Considered

- **Single phase (infra + schema together)** — Faster to reach the first real data model, but conflates two distinct failure domains and makes it harder to isolate bugs. Rejected.
- **Schema before connectivity** — Writing migrations before proving connectivity would require mocking Postgres, which defeats the purpose of real integration tests. Rejected.

---

## ADR-006 — JWT Access and Refresh Token Strategy

**Date**: Phase 3
**Status**: Accepted

### Context

We needed a secure, stateless authentication mechanism for the React frontend to communicate with the Express backend. The standard choices were session cookies (stateful) or JWTs (stateless).

### Decision

Use **short-lived JWT access tokens** (e.g., 15 minutes) sent in the response body, and **long-lived refresh tokens** (e.g., 7 days) stored in `httpOnly`, `secure`, `sameSite=lax` cookies. 

### Rationale

1. **XSS Protection**: By keeping the access token in memory (React context) and not in localStorage, we mitigate XSS attacks that try to steal tokens. The refresh token is in an `httpOnly` cookie, meaning JavaScript cannot read it at all.
2. **CSRF Mitigation**: Since the access token is sent via the `Authorization` header rather than a cookie, CSRF attacks are inherently mitigated for all API endpoints relying on the access token. 
3. **Stateless Verification**: JWTs can be verified without hitting the database or Redis, reducing latency on every protected route.
4. **Seamless UX**: Axios interceptors can catch 401s and automatically hit the `/refresh` endpoint using the `httpOnly` cookie, getting a new access token and retrying the original request without user interruption.

### Alternatives Considered

- **Sessions (Redis-backed)**: More secure out-of-the-box against some attacks and allows immediate revocation, but requires a Redis lookup on every request and configuring CSRF tokens. JWTs with short expirations provide a good balance of performance and security.
- **Access token in localStorage**: Rejected due to high XSS vulnerability.
- **Access token in httpOnly cookie**: Requires configuring CSRF protection for all mutating endpoints. We preferred the header approach.

---

## ADR-007 — Rate Limiting Algorithm (Fixed-Window Counter)

**Date**: Phase 13
**Status**: Accepted

### Context

Public and resource-intensive API endpoints (such as `POST /api/auth/login`, `POST /api/auth/register`, and `POST /api/runs`) are susceptible to abuse, including brute-force attacks and spam. We needed to implement a rate-limiting mechanism to protect the system.

### Decision

Implement a **Fixed-Window Counter** algorithm using Redis `INCR` and `EXPIRE`.

### Rationale

1. **Simplicity and Speed**: The fixed-window approach requires exactly one round-trip to Redis (`INCR`) for existing keys, and two for new keys (`INCR` + `EXPIRE`). This ensures minimal added latency compared to the Sliding Window Log approach which requires maintaining timestamps in a ZSET.
2. **Distributed Synchronization**: By relying on Redis as the central state store, all instances of the Node.js API servers share the same rate-limit counter for a given IP.
3. **Graceful Degradation**: Using an Express middleware that fails open `try/catch`, if Redis goes down, the application will allow traffic through rather than causing a total outage, which is preferable for an availability-focused application.
4. **Header Standardization**: The implementation exposes `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers, providing a clear contract for the React frontend (and Axios interceptors) to pause retries gracefully.

### Alternatives Considered

- **Sliding Window Log (Redis ZSET)**: More accurate as it prevents "bursts" at window boundaries, but adds $O(\log N)$ overhead and increased memory footprint. Rejected for Phase 13 due to complexity and overkill for simple login/register protection.
- **Token Bucket**: Also very effective but slightly more complex to implement atomically in Redis without Lua scripts. The Fixed-Window counter was chosen for its deliberate simplicity in line with project constraints.
