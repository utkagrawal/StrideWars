# StrideWars: Interview Preparation Guide

This document distills the architectural choices, algorithms, and concurrency mechanisms implemented in StrideWars into concrete, codebase-grounded answers for technical interviews.

---

## 1. Backend & Node.js

**Why Node.js? Why Express?**
Node.js was chosen for its non-blocking, event-driven architecture which is perfectly suited for highly concurrent, I/O-heavy applications like StrideWars. When a user uploads a run, the server isn't burning CPU cycles; it's waiting on Postgres to compute the bounding boxes and Redis to update the leaderboard. Express was selected because its minimalistic middleware pattern allows us to compose robust request pipelines (validation, authentication, error handling) without the heavy abstractions of frameworks like NestJS.

**How does async I/O work (event loop, non-blocking I/O, where this project relies on it)?**
Node.js runs Javascript on a single thread but delegates I/O operations (like network requests or database queries) to the operating system via `libuv`. When an operation completes, the OS places a callback in the Event Queue, which the Event Loop then pushes onto the call stack. In StrideWars, this allows a single Express process to handle hundreds of concurrent GPS run uploads. When we execute `await pool.query(...)` in the runs controller, the thread doesn't freeze; it moves on to serve other users' requests until PostgreSQL returns the result.

**How does Express middleware work?**
Express middleware are functions that have access to the request (`req`), response (`res`), and the `next` middleware function in the application’s request-response cycle. In StrideWars, we built a pipeline. First, `requireAuth` extracts the JWT from the `Authorization` header, verifies it, and attaches `req.userId`. Next, `requireOwnership` checks if the authenticated `userId` actually owns the resource they are trying to modify (e.g., marking a notification as read) by querying the database. If any middleware detects a violation, it sends a response early (e.g., `403 Forbidden`) and skips the remaining pipeline.

**How is authentication implemented?**
We implemented a stateless JWT (JSON Web Token) strategy to avoid hitting a database session table on every protected API call. We issue a short-lived Access Token (15m) in the response payload for the React frontend to keep in memory, mitigating XSS risks. Simultaneously, we issue a long-lived Refresh Token (7d) in an `httpOnly` cookie, protecting it from JavaScript access. If a user logs out, we increment a `token_version` integer in the Postgres `users` table. When the frontend attempts to use the Refresh Token, the server compares the token's embedded version against the database; if they differ, the token is revoked, instantly invalidating compromised sessions.

---

## 2. Database

**Why PostgreSQL over other databases for this project? Why relational over NoSQL here specifically?**
PostgreSQL was chosen for its unparalleled data integrity (ACID compliance) and its powerful PostGIS extension for geospatial operations. While a NoSQL database like MongoDB is great for unstructured data, StrideWars is highly relational. A `User` has many `Runs`, a `Run` generates many `Territory Captures`, and a `Territory` is owned by a `User`. Relational integrity (Foreign Keys and Cascading Deletes) ensures we never have orphaned captures if a user deletes their account.

**What indexes were created and why?**
In Phase 14, we validated our indexing strategy using `EXPLAIN ANALYZE`. We created `runs_user_id_created_at_idx` to allow the social feed to do a fast Index Scan rather than sorting millions of runs in memory. We created `territories_geohash_idx` to allow the map viewport to instantly look up visible tiles via an $O(1)$ B-Tree lookup (`WHERE geohash = ANY(...)`) instead of scanning the whole world. We also utilized a partial index on `notifications(user_id) WHERE read_at IS NULL` to make querying a user's unread badge count essentially $O(1)$ regardless of how many thousands of historical notifications they have.

**How do transactions work here?**
A transaction ensures that a series of database operations either completely succeed or completely fail together (Atomicity). In StrideWars, we built a `withTransaction` helper that automatically executes `BEGIN`, runs our callback, and then executes `COMMIT` on success or `ROLLBACK` on failure. We rely on this heavily in Phase 7 during territory capture: inserting the run, updating the territories, and recording the audit log in `territory_captures` all happen inside one transaction. If the server crashes halfway through, no partial state is saved.

**What happens under concurrent updates?**
When multiple users run through the same territory simultaneously, they could overwrite each other or cause race conditions. We solve this using deterministic database locking. When a run is uploaded, we map the GPS points to unique geohashes, put them in a Set to deduplicate them, and then **sort** them lexicographically. We then loop through this sorted list and execute `INSERT ... ON CONFLICT DO UPDATE`. Because every concurrent request acquires row-level locks in the exact same alphabetical order, circular deadlocks are mathematically impossible. The last transaction to commit successfully becomes the new owner.

---

## 3. Redis

**Why Redis? What was cached and why?**
Redis is an in-memory data store that offers sub-millisecond read/write latency. We use it to offload highly concurrent, read-heavy operations from PostgreSQL. Specifically, we use it for our rate-limiting fixed-window counters and our global leaderboards.

**How does cache invalidation work here?**
In Phase 14, we discovered a severe bottleneck. Initially, we manually deleted the leaderboard cache (`redis.del`) every time a user captured a territory. Under heavy load, this caused a "Cache Invalidation Storm": the cache was instantly destroyed, and hundreds of incoming leaderboard requests all slammed PostgreSQL simultaneously to re-hydrate the usernames. We fixed this by removing the manual deletion and relying strictly on a Time-To-Live (TTL) of 30 seconds. This guarantees that Postgres only receives one hydration query every 30 seconds, acting as a shield against thundering herds.

**Why sorted sets for leaderboards specifically?**
Querying a leaderboard natively in Postgres requires scanning the entire `territories` table, grouping by `owner_id`, sorting the counts, and applying a limit—an $O(N \log N)$ operation that degrades as the game grows. Redis Sorted Sets (`ZSET`) maintain data pre-sorted in a Skip List. Updating a score (`ZINCRBY`) takes $O(\log U)$ time, and retrieving the top 50 users (`ZREVRANGE`) takes $O(\log U + 50)$ time (where $U$ is total users). This keeps leaderboard API latencies under 1ms permanently.

---

## 4. Data Structures & Algorithms

**Geohashing (Phase 6)**
- **Naive**: Store raw `(lat, lng)` centers and calculate distance for every cell on every map pan.
- **Optimized**: We convert 2D coordinates into a 1D string (e.g., `9q8yyk8`). This creates a deterministic grid. Querying the map viewport is a simple `WHERE geohash IN (...)`.
- **Complexity**: $O(1)$ string encoding, $O(1)$ B-Tree index lookup.
- **Why**: Allows instant retrieval of millions of map tiles without heavy math.

**Set-Based Deduplication & Sorting (Phase 7)**
- **Naive**: Lock territories in the random order the GPS points were recorded.
- **Optimized**: Convert points to geohashes, put in a `Set` to deduplicate, convert back to array, and `sort()` alphabetically before requesting DB locks.
- **Complexity**: $O(N)$ dedup time, $O(U \log U)$ sort time (where $U$ is unique cells, $U \ll N$).
- **Why**: Eliminates circular database deadlocks during highly concurrent territory captures.

**Douglas-Peucker Algorithm (Phase 5)**
- **Naive**: Send all 10,000 raw GPS points to the frontend React map.
- **Optimized**: A recursive, divide-and-conquer algorithm that drops points that fall within a perpendicular distance tolerance of a line segment connecting two other points.
- **Complexity**: $O(N \log N)$ average time, $O(N)$ space for the call stack.
- **Why**: Drastically reduces network payload size and prevents the frontend Leaflet map from freezing when rendering complex routes.

**Haversine Formula (Phase 4)**
- **Naive**: Use Pythagorean theorem to calculate distance between coordinates.
- **Optimized**: Use spherical trigonometry (Haversine) to compute the great-circle distance.
- **Complexity**: $O(N)$ time, $O(1)$ space.
- **Why**: The Earth is a sphere; flat 2D math creates massive inaccuracies over long runs.

**Keyset Pagination / Database Merge Sort (Phase 11)**
- **Naive**: Use `OFFSET 1000` to paginate, or fetch all social events into memory and sort.
- **Optimized**: We use a `UNION ALL` CTE over `runs` and `territory_captures` utilizing a `timestamp < $1` cursor.
- **Complexity**: $O(1)$ page jumps (no scanning past skipped rows), leveraging $O(\log N)$ Index Scans.
- **Why**: Crucial for infinitely scrolling social feeds; `OFFSET` gets progressively slower as the user scrolls deeper.

**FOR UPDATE SKIP LOCKED (Phase 10)**
- **Naive**: Background workers `SELECT` the oldest job, then `UPDATE` it to processing. Race conditions cause duplicate processing.
- **Optimized**: `UPDATE ... WHERE id = (SELECT id FROM jobs FOR UPDATE SKIP LOCKED)`.
- **Complexity**: $O(1)$ row lock acquisition.
- **Why**: Allows multiple background worker pods to pull jobs from the same Postgres table concurrently. If a row is locked by Worker A, Worker B instantly skips it rather than waiting, avoiding contention.

---

## 5. System Design

**How would you scale to 1M users?**
Scaling follows the exact evidence-based path outlined in our Phase 14 `docs/scalability.md`. First, we would offload the React SPA and static assets to a CDN (Cloudflare). Second, we'd deploy PgBouncer in transaction-pooling mode, allowing us to spin up 50+ Node.js API pods horizontally without crashing PostgreSQL with thousands of idle connections. Third, we would provision Read Replicas for heavy read endpoints like `GET /api/runs`.

**What happens if Redis goes down?**
Our system degrades gracefully. For rate limiting, the Express middleware catches the Redis error, logs it, and allows the request through (failing open to preserve availability). For leaderboards, the API returns a 503 or falls back to an empty state. Once Redis returns, we run the reconciliation script (`npm run db:reconcile`) built in Phase 8, which performs a one-time heavy query against Postgres to recalculate the exact territory ownership and repopulate the Redis ZSETs, healing the system.

**What happens if PostgreSQL becomes the bottleneck?**
Profiling showed that write contention on the `jobs` table (using `FOR UPDATE SKIP LOCKED`) will be the first Postgres bottleneck at 1000x load. To fix this, we would implement the Transactional Outbox Pattern: we continue to write jobs to Postgres inside our run transaction to guarantee atomicity, but we deploy a CDC (Change Data Capture) tool like Debezium to tail the Postgres WAL (Write-Ahead Log) and push the jobs into a dedicated Redis queue (BullMQ). This removes the heavy polling and locking overhead from Postgres.

**How do you prevent duplicate run uploads?**
In Phase 4, we implemented idempotent uploads. The mobile client generates a UUID (`clientRunId`) when the run starts. The backend enforces a `UNIQUE(user_id, client_run_id)` constraint on the `runs` table. If a user enters a tunnel and the upload request drops, the app can retry the request safely. The backend will catch the unique constraint violation and return a `200 OK` (success) instead of crashing or duplicating the run.

**How do you prevent two users from capturing the same territory simultaneously?**
As implemented in Phase 7, we rely on PostgreSQL's row-level locks. User A and User B both submit a run covering Geohash "X". They both hit the `INSERT INTO territories ... ON CONFLICT (geohash) DO UPDATE` statement. Postgres forces one transaction to wait until the other finishes. User A commits first. User B's transaction unblocks, executes the `UPDATE`, overwrites User A's `owner_id`, and User B becomes the final owner. The deterministic sorting of geohashes before this step ensures they don't deadlock while waiting for each other.
