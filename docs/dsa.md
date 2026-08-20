# Data Structures & Algorithms

> **Status**: Finalized (Phase 15)

## Run Processing

- **Distance Calculation (Haversine Formula)**
  - **Problem**: GPS coordinates map to a sphere, not a flat 2D plane. We need the real-world distance between point sequences.
  - **Naive Approach**: Using the Pythagorean theorem ($a^2 + b^2 = c^2$) to calculate Cartesian distance between lat/lng coordinates. This approximation fails at real-world scales due to Earth's curvature.
  - **Optimized Approach**: The Haversine formula, which computes the great-circle distance between two points on a sphere.
  - **Complexity**: $O(n)$ time where $n$ is the number of points. Space complexity is $O(1)$.
- **Route Simplification (Douglas-Peucker Algorithm)**
  - **Problem**: Rendering or transmitting raw GPS tracks (which can contain tens of thousands of points for a long run) is slow and wastes bandwidth. 
  - **Naive Approach**: Return every single point to the frontend.
  - **Optimized Approach**: The Douglas-Peucker algorithm. It is a recursive, divide-and-conquer algorithm that finds the point furthest from the line segment connecting the track's endpoints. If that distance exceeds a tolerance, it keeps the point and recurses on both halves; otherwise, it discards all intermediate points. We use a flat-earth approximation scaled by latitude to compute the perpendicular distance in meters very efficiently.
  - **Data Structure**: Array, Recursive function call stack.
  - **Complexity**: $O(n \log n)$ average time, $O(n^2)$ worst-case time (if all points are retained on a jagged curve). Space complexity is $O(n)$ for the call stack and returned array.

## Territory Capture

- **Spatial Indexing (Geohashing)**
  - **Problem**: Given a GPS point or bounding box, we need to quickly identify which map cell (territory) it belongs to, or fetch all cells in the viewport, without scanning a massive database.
  - **Naive Approach**: Store a center `(lat, lng)` for every cell, and do a linear scan $O(n)$ checking distance: `WHERE distance(lat, lng) < radius`.
  - **Optimized Approach**: Geohashing. We convert the 2D `(lat, lng)` into a 1D string (e.g., `9q8yyk8`). This creates a deterministic, bucketed grid. To query a bounding box, we compute the required geohashes locally and do an $O(1)$ indexed lookup: `WHERE geohash IN (...)`.
  - **Complexity**: $O(1)$ average for string encoding/decoding, and $O(1)$ index lookup vs $O(n)$ linear scan.
  - **Why it matters**: A global map grid contains millions of cells. We only store claimed cells (lazy instantiation) and retrieve them instantly using B-tree indexing on the geohash string.

- **Deduplication & Deterministic Lock Ordering**
  - **Problem**: When a user uploads a run, it may contain 1,000 GPS points, but they might only span 5 distinct geohash cells. Furthermore, if two users upload runs spanning the same cells simultaneously, they could acquire database locks in alternating orders (User A locks Cell 1 then 2; User B locks Cell 2 then 1), resulting in a circular deadlock.
  - **Optimized Approach**: 
    1. First, we map all $N$ points to their string geohashes.
    2. We insert them into a `Set` to deduplicate down to $U$ unique cells.
    3. We sort the unique array of $U$ hashes lexicographically.
    4. We loop over the sorted hashes and execute `INSERT ... ON CONFLICT DO UPDATE` to lock and capture the cells.
  - **Complexity**: 
    - Deduplication: $O(N)$ time, $O(U)$ space (where $N$ = total points, $U$ = unique cells).
    - Sorting: $O(U \log U)$ time. Since $U \ll N$ (a run might have 1,000 points but only 10 unique cells), the sort overhead is negligible.
  - **Why it matters**: Sorting before locking is a fundamental distributed systems technique. By guaranteeing that every concurrent transaction acquires row locks in the exact same deterministic order, circular deadlocks are mathematically impossible.

## Leaderboards

- **Redis Sorted Sets (ZSET)**
  - **Problem**: Querying the leaderboard via Postgres (`SELECT owner_id, count(*) FROM territories GROUP BY owner_id ORDER BY count DESC LIMIT K`) requires scanning the entire `territories` table (millions of rows) on every request, which is an $O(N \log N)$ operation for grouping and sorting. Finding a specific user's rank is even worse.
  - **Naive Approach**: Execute the SQL query directly on the `/api/leaderboards` endpoint, or materialize it via triggers into a table (which locks).
  - **Optimized Approach**: Redis Sorted Sets (`ZSET`). Under the hood, this uses a hash map coupled with a Skip List. We maintain this asynchronously after Postgres commits using `ZINCRBY`. 
  - **Complexity**:
    - **Update/Insert**: $O(\log n)$ where $n$ is the number of users on the leaderboard.
    - **Top-K Retrieval (ZREVRANGE)**: $O(\log n + k)$ time.
    - **User Rank Retrieval (ZREVRANK)**: $O(\log n)$ time.
  - **Why it matters**: Since leaderboards are read astronomically more often than users actually complete runs (reads $\gg$ writes), shifting the sorting computation out of Postgres and into an incrementally-maintained $O(\log n)$ Redis skip list keeps API latencies sub-millisecond even with millions of active players.

## Social Feed & Pagination

- **Database-Level Merge Sort (`UNION ALL` + Keysets)**
  - **Problem**: Generating a social feed requires fetching recent events of *multiple* types (`runs` and `territory_captures`) from *multiple* users (everyone the current user follows), merged chronologically, and paginated efficiently.
  - **Naive Approach**: Fetching all events from all followed users into application memory and sorting them (`O(N log N)` where `N` is all events). Alternatively, performing N+1 queries.
  - **Optimized Approach**: The `getFeed` API uses a `UNION ALL` Common Table Expression (CTE). Postgres evaluates the `UNION ALL` across the two tables. Because we added composite indexes (`runs_user_id_created_at_idx` and `territory_captures_user_id_captured_at_idx`), Postgres can perform incredibly fast Index Scans to fetch the top `K` items per user, and then merge-sort them.
  - **Cursor Pagination**: We use the timestamp as a cursor (`timestamp_val < $2`) rather than `OFFSET`. This provides `O(1)` jumping to the next page instead of $O(N)$ scanning, which is critical for infinite-scroll social feeds.
  - **Phase 14 Validation**: `EXPLAIN ANALYZE` confirmed the theoretical complexity. The query executed in **1.7ms** across 50,000 runs, utilizing `Bitmap Index Scans` and a `top-N heapsort` memory sort, proving it never scans unnecessary depth.

## Background Job Queue Concurrency

- **PostgreSQL Database Queue (`FOR UPDATE SKIP LOCKED`)**
  - **Problem**: We need a background worker to process async jobs (like push notifications) from a `jobs` table. Running multiple instances of this worker risks double-processing a job if two instances query `SELECT ... status='pending'` at the exact same millisecond before either can `UPDATE` it to `processing`.
  - **Naive Approach**: `SELECT` the oldest job, then run an `UPDATE` in application code. This race condition leads to duplicate notifications.
  - **Optimized Approach**: `UPDATE jobs SET status='processing' WHERE id = (SELECT id FROM jobs WHERE status='pending' LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`.
  - **Why it matters**: `FOR UPDATE` locks the row from being modified by other transactions. `SKIP LOCKED` tells the database to instantly skip over any rows that are currently locked by other concurrent queries rather than waiting for the lock. This allows dozens of parallel worker pods to pull from the same Postgres table with zero contention and zero double-processing, completely eliminating the immediate need for a heavyweight message broker like RabbitMQ or BullMQ. This is the same class of lock-based concurrency control used in Phase 7 for territory captures.

## Rate Limiting

- **Fixed-Window Counter (Redis)**
  - **Problem**: Public endpoints like login, registration, and run submissions are vulnerable to brute-force attacks, spam, and abuse. We need to limit the number of requests a given user or IP address can make within a specific time window.
  - **Naive Approach**: Maintain an in-memory dictionary in the Node.js process `(IP -> count)`. This fails in a multi-pod Kubernetes or Docker Compose environment where load balancers route requests to different instances, leading to isolated and inaccurate rate counts.
  - **Optimized Approach**: Redis-backed Fixed-Window counters using `INCR` and `EXPIRE`. When a request arrives, the server constructs a key like `rl:login:192.168.1.1` and calls `INCR`. If the returned count is `1`, an `EXPIRE` command is sent to set the TTL (e.g., 900 seconds for a 15-minute window).
  - **Complexity**: $O(1)$ time complexity for both `INCR` and `EXPIRE`. Space complexity is $O(U)$ where $U$ is the number of unique active IPs in the current window.
  - **Why it matters**: A Redis-backed implementation guarantees centralized, atomic, and extremely fast rate limiting across a distributed fleet of API servers. Using `INCR` avoids race conditions inherent in `GET` -> `count++` -> `SET` patterns.
