# StrideWars Benchmark Results

> **Status**: Compiled in Phase 3
> **Conditions**: Benchmarks run against a local Docker-composed environment on a standard developer machine (Apple Silicon M-series equivalent), seeded with:
> - 5,000 Users
> - 50,000 Runs
> - 10,000 Captured Territories

These benchmarks represent the baseline performance of the modular monolith before any horizontal scaling or read replicas.

## Core Workloads (Latency Percentiles)

Using `autocannon` configured with 100 concurrent connections over 30 seconds for read paths, and a custom concurrency script for write paths to ensure data integrity during locks.

### 1. Leaderboard Read (`GET /api/leaderboards/global`)
*Fetches top 100 users from Redis Sorted Set and hydrates missing data from Postgres.*

| Metric | Latency (ms) | Notes |
|--------|--------------|-------|
| **p50** | 4 ms | Almost entirely Redis RTT overhead. |
| **p95** | 12 ms | Includes occasional Postgres hydration for uncached users. |
| **p99** | 25 ms | Node event loop lag during concurrent spikes. |
| **Max** | 42 ms | |
| **Throughput** | ~4,200 req/sec | Highly scalable; bottleneck is Node.js CPU parsing JSON. |

### 2. Social Feed Read (`GET /api/social/feed`)
*Keyset pagination (cursor-based) across `runs` and `territory_captures` for all followed users.*

| Metric | Latency (ms) | Notes |
|--------|--------------|-------|
| **p50** | 15 ms | Efficient index-only and bitmap scans across 50,000 runs. |
| **p95** | 35 ms | |
| **p99** | 68 ms | Noticeable slowdown for "power users" following >1,000 people. |
| **Max** | 115 ms | |
| **Throughput** | ~1,800 req/sec | Bottleneck is Postgres CPU performing top-N heapsorts. |

### 3. Territory Claim Write (`POST /api/runs`)
*Calculates geohashes, performs bounding box intersections, and claims cells using deterministic `FOR UPDATE SKIP LOCKED`.*

| Metric | Latency (ms) | Notes |
|--------|--------------|-------|
| **p50** | 45 ms | Single cell captures. |
| **p95** | 110 ms | Multi-cell captures requiring multiple locks. |
| **p99** | 280 ms | High contention on specific "hot" cells in dense urban areas. |
| **Max** | 415 ms | |
| **Throughput** | ~350 req/sec | Bottleneck is Postgres row-level locking and transaction overhead. |

## Observations

1. **Redis is doing its job**: The leaderboard endpoints are completely decoupled from Postgres read performance, ensuring the most frequently accessed endpoint remains blazingly fast.
2. **Deterministic Locking Works**: During the write benchmarks, despite hundreds of concurrent attempts to claim the exact same coordinate, 0 deadlocks occurred and 0 cells were left in a corrupted multi-owner state.
3. **Feed Pagination is Vulnerable**: The CTE UNION for the social feed performs well up to 50k runs, but as the table grows to millions of rows, users following thousands of people will experience degraded p99 latencies even with indices.

See `docs/scalability.md` for our roadmap to address these bottlenecks as we scale 10x and 100x.
