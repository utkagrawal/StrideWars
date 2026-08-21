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

### Consequences

- **Session (Redis-backed)**: More secure out-of-the-box against some attacks and allows immediate revocation, but requires a Redis lookup on every request and configuring CSRF tokens. JWTs with short expirations provide a good balance of performance and security.
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

---

## ADR-008 — Map-First Landing Experience

**Date**: Phase 18
**Status**: Accepted

### Context

Originally, the post-login landing route was the User Dashboard (`/dashboard`), which presented statistics (runs, territories, rank) and activity feeds. The core gameplay loop of StrideWars, however, revolves around the geographic map and capturing territories. 

### Decision

Elevate the interactive Map (`/`) to be the default post-login landing route. The dashboard statistics have been compacted into a collapsible HUD overlaid directly on the map.

### Rationale

1. **Immediate Spatial Context**: Users immediately see their captured territories and nearby rivals upon opening the app, emphasizing the game's core value proposition.
2. **Action-Oriented UX**: The primary "Start Run" action is explicitly placed on the map. By landing here, users are one click away from recording a run.
3. **Information Density**: Consolidating dashboard stats into a collapsible map HUD preserves the utility of the dashboard without requiring a dedicated navigation step. Users can still access the full `/dashboard` for deeper history, but the critical at-a-glance metrics are always present during gameplay.

---

## ADR 009: Narrative Arc & UX Polish (Phase 19)
**Date**: 2026-08-20

### Context
The application had the core mechanics of tracking runs and capturing territory, but felt like a collection of disjointed technical features rather than a cohesive experience.

### Decision
Implement a unified narrative arc ("Claim your ground. Close the loop. Defend your turf.") across all touchpoints:
1. Replaced the technical "Start Run" button with "Claim Ground".
2. Updated all empty states across Feed, History, Dashboard, and Profile to reinforce the narrative.
3. Added a first-time user tour on the map using `localStorage` to explain the mechanics visually.
4. Created a dedicated Landing page for unauthenticated users that frames the value proposition before login.
5. Standardized the brand color (`#4ade80`) across all success states and owned territories.

### Consequences
- Significantly improves the first-time user experience and onboarding.
- Standardizes vocabulary ("territory/cell/ground", "claim/take/reclaim").
- Requires maintenance of the `stridewars_tour_seen` flag in `localStorage`.

---

## ADR 010: Map Rendering, Centering, and Demo Data (Phase 20)
**Date**: 2026-08-20

### Context
Previously, territory cells were rendered as individual grid squares, which looked blocky. The map also defaulted to San Francisco, making it confusing for users elsewhere. We also lacked an easy way to demo the core loop without physically moving or repeatedly generating single points.

### Decision
1. **Real-Map Rendering**: We replaced the grid square rendering with continuous Polygons. We group viewport cells by owner, and run a client-side adjacency flood-fill & edge-tracing algorithm to generate the outer rings of the clustered cells. We deliberately *avoided* joining the heavy run point-path data in the territories endpoint to keep the API fast and payload small.
2. **Real-Time GPS Centering**: The map now centers on the user's real location using `navigator.geolocation` on first load. If denied, it falls back gracefully to IIT Guwahati (~26.1878, 91.6916).
3. **Generate Random Loop UX**: We added a 1-click button that generates a full loop and *immediately* submits it, bypassing any preview state to minimize friction for demoing the capture mechanic.
4. **Seed Script**: The backend `seed.ts` script was augmented to generate 5 demo users with captured territories around IIT Guwahati.

### Consequences
- Much smoother and organic look to the map.
- Edge-tracing algorithm runs in O(N) client-side, eliminating the need for a heavy spatial union library like Turf.js.
- Requires user permission for location for optimal initial experience.

---

## ADR 011: Road-Following Loop Generation (Phase 21)
**Date**: 2026-08-20

### Context
Previously, the "Generate Random Loop" button produced a perfect circle of points using the spherical destination-point formula. While mathematically pure, these loops crossed over buildings and rivers, making them unrealistic and breaking the immersion of a running app. We needed a way to generate realistic loops along actual road networks for demo purposes.

### Decision
1. **Overpass API Integration**: We use the public Overpass API to fetch OpenStreetMap (OSM) highway nodes and ways within a 500m radius of the map center.
2. **Graph-Walking Algorithm**: We parse the OSM data into an adjacency list and perform a bounded random walk to generate a path of a target distance (300-800m).
3. **Circular Fallback**: If the Overpass API fails, rate-limits us, or returns no roads (e.g., in the middle of the ocean), the generator gracefully falls back to the previous circular destination-point formula.
4. **Simplified UX**: The generated loop is immediately highlighted on the map and automatically submitted to the capture pipeline after a 1.5s delay, removing friction from the demo experience.

### Consequences
- Dramatically increases the realism of generated loops, improving the prototype's demonstration value.
- Introduces an external runtime dependency (Overpass API) on a public server, which is why the robust fallback is critical.
- Moves loop generation logic from the frontend to the backend (`/api/runs/generate-loop`), allowing both the UI and the backend seed scripts to share the exact same road-following logic.

---

## ADR 012: Phase 22 Bug Fixes & Refinements
**Date**: 2026-08-21

### Context
Phase 21 introduced realistic road following and polished the UI, but testing uncovered 4 significant regressions and bugs that affected the core gameplay experience.

### Decision
1. **GPS Log**: Changed the single-coordinate readout to a vertically stacked, 5-point rolling buffer with timestamps. This helps players visualize their GPS drift and ensures location tracking feels continuous rather than disjointed.
2. **Overpass Fallback Fix**: The `generateRoadLoop` fallback was triggering silently due to a malformed `x-www-form-urlencoded` payload to the Overpass API. We corrected the fetch body to URL-encode the `data` parameter.
3. **Random Loop Button Visibility**: Refactored the UI so the "Generate Random Loop" button is always available, even while a run is actively recording, without interrupting the global recording state machine.
4. **Leaderboard True Area Calculation**: Changed the leaderboard scoring from raw cell count (`ZINCRBY`) to true union area (`ZADD`). By clustering adjacent cells and extracting their perimeter via `traceClusterPerimeter` on the backend, the leaderboard now accurately ranks users based on real-world $m^2$ claimed, rather than double-counting intersecting or adjacent cells.

### Consequences
- Ranking is mathematically robust and matches the visual map representation.
- Requires computing the user's entire area on capture, which scales with the number of cells owned. If this becomes a bottleneck, the total area can be cached in Postgres.

---

## ADR 013: Path-Based Territory Rendering & Unified Metrics (Phase 23)
**Date**: 2026-08-21

### Context
Phase 20 introduced an edge-tracing algorithm to merge adjacent square cells into continuous polygons. However, it still fundamentally rendered blocky grid shapes rather than the actual shape of the recorded run (the smooth, curved GPS track). Additionally, the leaderboard showed raw territory counts instead of area, causing a disconnect between the "Area Claimed" metric and the ranking.

### Decision
1. **Path Storage**: We added a `path_polygon` JSONB column to the `runs` table to permanently store the exact, closed path of the run as it was captured. The `territories` table was updated with a `captured_run_id` column to map each cell to the specific run that captured it.
2. **Smooth Rendering**: The backend now returns a dictionary of `runPolygons` (the `path_polygon` data) alongside the territories. The frontend uses these exact paths to render smooth SVG polygons for recent runs, gracefully falling back to the old grid-cell edge-tracing algorithm for legacy data.
3. **Unified Area Metrics**: The leaderboard scoring logic was standardized to strictly use `areaSquareMeters`. The frontend `formatArea` utility automatically formats areas under 10,000m² in square meters and larger areas in square kilometers (with 2 decimal places).
4. **Seed Updates**: `seed.ts` now calls `rebuildLeaderboards()` to populate Redis with the correct starting area metrics.

### Consequences
- Territories visually match the natural path of the roads the user ran, vastly improving visual appeal.
- The leaderboard correctly reflects the area metric shown throughout the UI.
- Increased storage per run (due to JSONB `path_polygon`), but this is offset by the massive visual improvement.

---

## ADR 014: Phase 24 Bug Fixes & Refinements
**Date**: 2026-08-21

### Context
Phase 24 addressed two remaining UX issues:
1. The last-5 GPS readout from Phase 22 was completely missing from the screen during a recording.
2. The Regional leaderboard tab was hardcoded to "San Francisco" (geohash `9q8`), instead of detecting the user's actual region.

### Decision
1. **GPS Readout Fix**: We discovered the issue was two-fold: the `currentGpsLog` was being aggressively cleared, and `navigator.geolocation.getCurrentPosition` was being polled in an interval which can silently fail or hang while `watchPosition` is already active. Additionally, inside simulation mode, side-effects were incorrectly placed inside a React functional state updater. We refactored the logic to cleanly read from a `runPointsRef` on a 2-second interval, ensuring the readout is purely a display layer reading from the existing tracked points, without changing the underlying capture rate.
2. **Dynamic Regional Leaderboard**: We updated the `Leaderboards.tsx` frontend and `/api/leaderboards/region` backend endpoint. The frontend now attempts to grab the user's actual GPS location. If successful, it passes `lat` and `lng` to the backend. The backend computes the 3-character geohash prefix on the fly, queries the OSM Nominatim API for reverse geocoding to retrieve the city/region name, and returns the customized regional leaderboard. If the location is denied or unavailable, it gracefully falls back to the Global tab's data or a "Regional (Unavailable)" label.

### Consequences
- The UI properly displays the live GPS feed during recording without double-polling the hardware.
- The leaderboard provides a much better contextual experience by instantly dropping users into their actual city's rankings, improving competitiveness.
- Added a lightweight, server-side reverse-geocoding dependency via Nominatim, which required a custom `User-Agent` to comply with OSM usage policies.

---

## ADR 015: Phase 25 Bug Fixes & Refinements
**Date**: 2026-08-21

### Context
Phase 25 addressed two regressions that appeared after the Phase 24 modifications:
1. The last-5 GPS readout was duplicating a single fix 5 times instead of showing 5 distinct fixes.
2. The Regional leaderboard was throwing a "Failed to fetch leaderboard data" error, breaking the tab completely.

### Decision
1. **GPS Readout Fix**: 
   - **Root Cause**: The Phase 24 implementation used a `setInterval` that, every 2 seconds, grabbed the *last* available element from `runPoints` and blindly pushed it into the `currentGpsLog` array. If the user was stationary (or if the hardware hadn't pushed a new fix yet), it repeatedly pushed the exact same point with the exact same timestamp. Furthermore, in simulation mode, points were not auto-advancing, resulting in identical duplicate coordinates.
   - **Fix**: We eliminated the stateful `currentGpsLog` and the `setInterval` completely. The readout is now derived directly by mapping the last 5 elements of `runPoints` (e.g. `[...runPoints].reverse().slice(0, 5)`). Because `watchPosition` already inherently handles throttling and pushes new distinct updates over time, deriving the log array from `runPoints` guarantees it exactly mirrors genuine updates. For simulation mode, we added an interval that correctly generates and appends a new simulated point to `runPoints` every 2 seconds to accurately mimic walking.
2. **Dynamic Regional Leaderboard Fix**: 
   - **Root Cause**: The Phase 24 backend controller (`getRegionalLeaderboard`) attempted to use `axios` for the reverse geocoding API call (`require('axios')`), but `axios` was not installed in the `backend` workspace dependencies. This caused a `MODULE_NOT_FOUND` error to throw, bubble up to the Express error handler, and return a 500 error, crashing the frontend tab. 
   - **Fix**: Replaced the missing `axios` dependency with Node's native `fetch` API, wrapped in a native `AbortSignal.timeout(5000)` to ensure it still fails gracefully. We also updated the corresponding backend integration tests to mock `global.fetch` instead of `axios.get`.

### Consequences
- The GPS readout now genuinely reflects the physical tracking rate. 
- Avoided adding a redundant HTTP client dependency to the backend.

---

## ADR 016: Geospatial Indexing (Geohash vs. Quadtree vs. R-Tree)
**Date**: Phase 5 (Interview Prep)

### Context
StrideWars requires a highly scalable mechanism for checking which map cells a user's run path intersects and persisting ownership of those cells. We needed to choose the fundamental spatial data structure for this workload. The primary candidates were **Geohash**, **Quadtree**, and **R-Tree** (via PostGIS).

### Decision
We chose **Geohash** (specifically string-based geohashes stored in standard Postgres `TEXT` columns with B-Tree/Bitmap indexing) as the core spatial representation for territories, avoiding native PostGIS R-Trees for the critical write path.

### Rationale

1. **Write Scale & Contention**: 
   Our most critical path is `POST /api/runs`, which performs highly contested writes. During a run, a user captures cells. If we used an R-Tree via PostGIS (`geometry` column) to represent abstract polygon ownership, locking concurrent updates to overlapping geometries becomes extremely complex and prone to deadlocks. 
   With Geohash, the world is pre-divided into a deterministic grid of text strings. This allows us to use `INSERT ... ON CONFLICT (geohash) DO NOTHING` followed by a deterministic `SELECT ... FOR UPDATE SKIP LOCKED` on the exact string keys. We can sort the geohash strings lexicographically before requesting locks, completely eliminating circular deadlocks under high concurrency.
   
2. **Database Simplicity vs Library Support**: 
   Quadtrees (like S2 geometry or H3 hexagons) offer more uniform cell sizes globally. However, H3 and S2 require native Postgres extensions that aren't natively supported on all managed DB providers without custom images. Geohash is natively supported in Node.js via lightweight libraries (e.g., `ngeohash`) and requires zero database extensions. We generate the hashes in Node.js and simply store them as `TEXT` in Postgres.

3. **Cell-Boundary Tradeoffs (The Pole Problem)**: 
   Geohash grid cells become distorted closer to the poles compared to H3 hexagons. However, for a gamified running app where 99% of users are located in mid-latitudes, the distortion is an acceptable trade-off for the sheer simplicity of string-prefix searches (e.g., `LIKE '9q8%'` for a regional leaderboard) and exact-match string locking.

### Alternatives Considered
- **PostGIS R-Tree (`geometry`)**: Ideal for complex, arbitrary polygon overlaps, but introduces massive transaction overhead and locking complexity when attempting to resolve "last capture wins" for overlapping polygons at high write scale.
- **Uber's H3 (Hexagons)**: Visually superior and maintains uniform area globally, but adds significant deployment friction due to requiring Postgres extensions for database-side manipulation, or storing integer IDs that lack the easy prefix-search capabilities of Geohash strings.
