# Database Schema & Migrations

> **Status**: Updated in Phase 2

## Overview

StrideWars uses **PostgreSQL 16** as the primary relational datastore. We deliberately use raw SQL migrations and `pg` for interactions to maintain granular control, optimize performance (especially for geospatial data), and deepen the team's understanding of the underlying database mechanics.

## Raw SQL vs ORMs (ADR-006)

We use `node-pg-migrate` instead of an ORM (Prisma, Sequelize, TypeORM).

### Rationale

1. **Learning Depth**: Writing SQL directly builds a deeper understanding of PostgreSQL features (like `TIMESTAMPTZ`, geospatial functions, `JSONB` indexing).
2. **Predictable Performance**: ORMs often generate suboptimal queries (e.g., N+1 problems or complex joins). Raw SQL ensures we know exactly what is executing.
3. **Advanced PostgreSQL Features**: Later phases will heavily utilize PostGIS for territory calculations, which are difficult to map cleanly in many ORMs.
4. **Reduced Abstraction Leaks**: When queries perform poorly, developers don't have to fight the ORM's syntax to optimize it.

## Initial Schema (Phase 2)

### `users`
Core user identity and authentication.
- `id` (UUID, PK, default `gen_random_uuid()`)
- `username` (TEXT, UNIQUE, NOT NULL)
- `email` (TEXT, UNIQUE, NOT NULL)
- `password_hash` (TEXT, NOT NULL)
- `display_name` (TEXT)
- `created_at` (TIMESTAMPTZ, NOT NULL, default `now()`)

### `runs`
Metadata for a completed run.
- `id` (UUID, PK, default `gen_random_uuid()`)
- `user_id` (UUID, NOT NULL, REFERENCES `users(id)`)
- `client_run_id` (UUID, NOT NULL) - Used for idempotency.
- `distance_meters` (NUMERIC, NOT NULL)
- `duration_seconds` (INTEGER, NOT NULL)
- `avg_pace_sec_per_km` (NUMERIC)
- `started_at` (TIMESTAMPTZ, NOT NULL)
- `created_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- **Indexes**: 
  - `UNIQUE(user_id, client_run_id)` for idempotency from the mobile client.
  - `runs_user_id_created_at_idx` on `(user_id, created_at DESC)` to support fast retrieval of a user's run feed.

### `run_points`
High-frequency GPS points for each run.
- `id` (BIGSERIAL, PK)
- `run_id` (UUID, NOT NULL, REFERENCES `runs(id)` ON DELETE CASCADE)
- `seq` (INTEGER, NOT NULL) - Ordering of the point.
- `lat` (DOUBLE PRECISION, NOT NULL)
- `lng` (DOUBLE PRECISION, NOT NULL)
- `recorded_at` (TIMESTAMPTZ, NOT NULL)
- **Indexes**: `(run_id, seq)` to efficiently pull ordered points for a specific run.

### `territories`
Geographic tiles that users can capture.
- `id` (UUID, PK, default `gen_random_uuid()`)
- `geohash` (TEXT, UNIQUE, NOT NULL)
- `owner_id` (UUID, REFERENCES `users(id)`)
- `captured_at` (TIMESTAMPTZ)
- `center_lat` (DOUBLE PRECISION, NOT NULL)
- `center_lng` (DOUBLE PRECISION, NOT NULL)
- **Indexes**:
  - `geohash`: for quick spatial lookup.
  - `owner_id`: to quickly find a user's empire.

### `territory_captures`
Audit log of territory ownership changes.
- `id` (BIGSERIAL, PK)
- `territory_id` (UUID, NOT NULL, REFERENCES `territories(id)`)
- `run_id` (UUID, NOT NULL, REFERENCES `runs(id)`)
- `user_id` (UUID, NOT NULL, REFERENCES `users(id)`)
- `captured_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- **Indexes**:
  - `territory_captures_user_id_captured_at_idx` on `(user_id, captured_at DESC)` to support fast retrieval of a user's capture feed.

### `follows`
Social graph connections.
- `follower_id` (UUID, NOT NULL, REFERENCES `users(id)`)
- `followee_id` (UUID, NOT NULL, REFERENCES `users(id)`)
- `created_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- **Indexes**: 
  - `PRIMARY KEY(follower_id, followee_id)` ensuring uniqueness and providing an index for fast lookups of who a user follows.
  - `follows_followee_id_idx` on `(followee_id)` for fast lookups of who follows a user.

### `notifications`
In-app notification dispatch.
- `id` (BIGSERIAL, PK)
- `user_id` (UUID, NOT NULL, REFERENCES `users(id)`)
- `type` (TEXT, NOT NULL)
- `payload` (JSONB, NOT NULL)
- `read_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- **Indexes**: Partial index on `user_id` `WHERE read_at IS NULL` to ultra-fast load unread notification counts.

### `jobs`
Background tasks and asynchronous workers.
- `id` (BIGSERIAL, PK)
- `type` (TEXT, NOT NULL)
- `payload` (JSONB, NOT NULL)
- `status` (TEXT, NOT NULL, default `'pending'`)
- `attempts` (INTEGER, NOT NULL, default 0)
- `created_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- **Indexes**: `status` for fast polling of `'pending'` jobs.

## EXPLAIN ANALYZE Profiling (Phase 14)

Under a seeded dataset of 5,000 users, 50,000 runs, and 10,000 territory captures, we performed EXPLAIN ANALYZE on critical paths. All query plans demonstrated optimal `Bitmap Index Scan` usage, with no sequential scans required on large tables.

### 1. Run History Pagination
```sql
EXPLAIN ANALYZE
SELECT * FROM runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
```
- **Execution Time**: ~0.605 ms
- **Plan**: `Bitmap Index Scan` on `runs_user_id_created_at_idx`.

### 2. Territory Bbox Lookup
```sql
EXPLAIN ANALYZE
SELECT * FROM territories WHERE geohash = ANY($1)
```
- **Execution Time**: ~0.078 ms
- **Plan**: `Bitmap Index Scan` on `territories_geohash_idx`.

### 3. Feed Generation (CTE UNION)
```sql
-- (Follows -> Runs/Captures Merge Sort)
```
- **Execution Time**: ~1.762 ms
- **Plan**: Uses `Index Only Scan` on `follows_pkey`, and `Bitmap Index Scan` on both `runs_user_id_created_at_idx` and `territory_captures_user_id_captured_at_idx`. The top-N heapsort prevents scanning unnecessary depth.

### 4. Leaderboard Hydration
```sql
EXPLAIN ANALYZE
SELECT id, username, display_name FROM users WHERE id = ANY($1)
```
- **Execution Time**: ~0.120 ms
- **Plan**: `Bitmap Index Scan` on `users_pkey`.

## Index Justifications

Every index in StrideWars exists to solve a specific production query pattern:

1. **`users_pkey`**: Primary key. Hydrates Redis leaderboard payloads via `id = ANY(...)`.
2. **`runs_user_id_created_at_idx`**: Supports `GET /api/runs` user history pagination and social feed CTE generation without a memory sort.
3. **`run_points_run_id_seq_idx`**: Essential for returning an ordered track when fetching a specific run.
4. **`territories_geohash_idx`**: Powers the map viewport `WHERE geohash = ANY(...)` spatial queries instantly.
5. **`territories_owner_id_idx`**: Speeds up `GET /api/territories/mine` and full leaderboard recalcs without a full table scan.
6. **`territory_captures_user_id_captured_at_idx`**: Same as runs — drives the CTE social feed generation for territory capture events.
7. **`follows_pkey (follower_id, followee_id)`**: Backs the `GET /api/social/following` list and prevents duplicate follows.
8. **`follows_followee_id_idx`**: The inverse of the pkey; powers the `GET /api/social/followers` list.
9. **`notifications_user_id_unread_idx`**: A partial index (`WHERE read_at IS NULL`) making the global unread badge count essentially $O(1)$ regardless of historical notification volume.
10. **`jobs_status_idx`**: Ensures the background worker `SELECT ... WHERE status='pending'` instantly finds the next job.

## Migrations

We use `node-pg-migrate` written in TypeScript. 
Commands:
- `npm run migrate:create <name>`: Create a new migration file.
- `npm run migrate:up`: Apply pending migrations.
- `npm run migrate:down`: Revert the last migration.
