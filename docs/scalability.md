# Scalability

> **Status**: Placeholder — updated as load characteristics are identified

## Current Bottlenecks (Based on Phase 3 Benchmarks)

Based on the load testing results documented in [`docs/benchmarks.md`](benchmarks.md), our current baseline architecture (Single Node.js instance, Single Postgres DB, Single Redis instance) exposes the following honest bottlenecks:

1. **Social Feed Degradation for Power Users**: While p50 latency is excellent (15ms), users following >1,000 people will experience p99 latencies nearing 70ms. The bottleneck here is the top-N heapsort in Postgres during the CTE UNION of `runs` and `territory_captures`.
2. **Transaction Contention on "Hot" Cells**: Claiming highly contested territories causes p99 latency to spike to ~280ms due to row-level `FOR UPDATE SKIP LOCKED` wait times.
3. **Database Connection Limits**: The throughput for write paths tops out at ~350 req/sec not because of CPU, but because the raw Postgres connection pool becomes saturated holding transactions open during geohash intersections.
4. **No Read Replica Yet**: All analytical read loads (like feed generation) compete for I/O with our critical, transaction-heavy write paths (territory claiming).

### The First Bottlenecks (10x - 1000x Load)

1. **At 10x Load (Cache Invalidation Storm)**
   - *Bottleneck*: Regenerating the leaderboard user details from Postgres.
   - *Evidence*: Previously, every territory capture manually `DEL`ed the leaderboard cache. At 10 runs per second, the cache would never hit, sending thousands of hydration queries to Postgres.
   - *Mitigation*: Removed manual invalidation. We now rely strictly on a 30s TTL to absorb the "thundering herd."
2. **At 100x Load (Connection Exhaustion)**
   - *Bottleneck*: Postgres running out of connections if Node.js pods horizontally scale.
   - *Evidence*: 50 Node pods * 20 connections = 1000 connections, crashing standard Postgres.
   - *Mitigation*: Introduce **PgBouncer** in transaction-pooling mode.
3. **At 1000x Load (Write Contention on Jobs/Captures)**
   - *Bottleneck*: `FOR UPDATE SKIP LOCKED` on a single Postgres `jobs` table will experience high lock contention and disk I/O bottlenecks.
   - *Mitigation*: Move async jobs out of Postgres and into a dedicated Redis queue (**BullMQ**).

## Ordered Horizontal Scaling Path

The modular monolith is designed to be split into microservices only if necessary. Modules share no in-process state (all shared state lives in Postgres or Redis), making extraction straightforward. We will execute the following steps *in order* as load dictates:

1. **CDN Caching (Frontend & Static Assets)**
   - Offload all React bundles and static assets to Cloudflare/Cloudfront.
2. **Read Replicas (Postgres)**
   - Offload `GET /api/runs` and `GET /api/territories` to a read replica.
3. **Connection Pooling (PgBouncer)**
   - Deploy PgBouncer in front of Postgres to allow Node API instances to scale horizontally to 50+ pods without exceeding Postgres connection limits.
4. **Dedicated Queue (BullMQ)**
   - Migrate background tasks from the `jobs` Postgres table to Redis-backed BullMQ using the Transactional Outbox pattern.
5. **Sharding by Region**
   - Horizontally shard the `territories` and `runs` tables by geohash prefixes (e.g., NA runs on DB1, EU runs on DB2).
6. **Batch Run-Upload Architecture (Resilience Upgrade)**
   - *Current State*: The frontend buffers all recorded GPS points in memory and submits them as a single monolithic payload on "Finish Run".
   - *Future Upgrade*: For very long runs (e.g. marathons) where the browser might crash or lose context, the frontend should periodically flush buffered points to a lightweight, ephemeral `POST /api/runs/live-sync` endpoint (e.g. every 10-15 seconds). These partial syncs would not trigger territory captures or lock contention; they would simply append to the `run_points` table. "Finish Run" would then just signal the final closure and trigger the Phase 16 territory capture logic on the accumulated points. *Note: This is explicitly documented here as a future resilience upgrade and is not required for the current prototype Phase.*
