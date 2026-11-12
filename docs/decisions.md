# Design decisions

The main choices behind StrideWars, why I made them, and what I gave up. Most of them are about one thing: lots of people writing to the same map at the same time.

## TypeScript on both ends

The frontend and backend are both TypeScript. Request and response shapes are checked on both sides, which catches a whole class of bugs (renamed fields, wrong types) before anything runs. Plain JavaScript would have been quicker to start with, but the capture logic has enough moving parts that I wanted the compiler on my side.

## One app, split into modules (not microservices)

The backend is a single Express app with a folder per domain: `auth`, `users`, `runs`, `territories`, `leaderboards`, `social` and `notifications`. Each one has `routes -> controller -> service`, and modules only talk to each other through their service functions.

The reason is the capture. Changing cell ownership, writing the capture history and queuing alerts all have to happen in one Postgres transaction. In separate services that would need a saga or distributed transactions. As a single app it's one `BEGIN ... COMMIT`, with one deployable and one log to read. If one area ever needed to scale on its own (say, the notification worker), the module boundary is already where the split would go.

## Postgres as the source of truth, no PostGIS

Everything that matters (users, runs, cell ownership, capture history, jobs) lives in Postgres. Redis only holds data that can be rebuilt from Postgres.

I didn't use PostGIS. The map is a fixed grid, so ownership is one row per cell, keyed by a text geohash with a unique constraint. Lookups are ordinary B-tree index scans, and locking a cell is just locking a row. Overlapping polygon geometries would have made "who owns this bit of street" and row locking much harder, and the extension isn't available on every free database host.

## The grid: geohash precision 8 (about 34 × 19 m)

A geohash turns a location into a short string, and nearby places share a prefix. I use precision 8, which works out to roughly 34 × 19 m in Guwahati. A typical 1–2 km loop claims a few hundred cells, and the territory follows the shape of the route.

I started with precision 7 (about 150 × 150 m). It was cheap to store, but a single run only claimed a handful of big blocks and the map looked chunky. Moving to 8 meant ~30× more cells, which forced two other changes: set-based captures (below) and a different viewport query.

The 3-character prefix of a cell (an area roughly 150 km across) doubles as its "region" for regional leaderboards.

Geohash cells get narrower towards the poles. Uber's H3 hexagons are more uniform, but they need a database extension or a native library, and almost everyone plays at mid latitudes, so the trade wasn't worth it.

## Capturing cells: last capture wins, locked in sorted order

When a run encloses a cell, the runner takes it, whoever owned it before. That keeps the map moving.

Two overlapping runs can arrive at the same moment, so each cell row is locked with `SELECT ... FOR UPDATE` inside the capture transaction. The second run waits for the first to commit, then sees the new owner and takes the cell. Nothing is half-applied.

Locking many rows in two transactions can deadlock if they lock in different orders (A locks 1 then 2, B locks 2 then 1). Every capture sorts its cell IDs and locks with `ORDER BY geohash FOR UPDATE`, so all transactions take locks in the same global order and a cycle can't form. `capture.integration.test.ts` fires three overlapping runs at once to check this.

The capture is set-based: insert missing cells with one `INSERT ... SELECT FROM unnest(...) ON CONFLICT DO NOTHING`, lock them with one `SELECT`, update them with one `UPDATE ... WHERE id = ANY(...)`, and write the history with one `INSERT ... SELECT`. It used to be three queries per cell, which was fine for 150 m cells but not for thousands of small ones. A 400-cell capture now takes about 25 ms.

## Uploads are idempotent

Phones lose signal and retry. Each run carries a UUID generated on the client, and `runs` has a unique constraint on `(user_id, client_run_id)`. The insert uses `ON CONFLICT DO NOTHING`; if nothing was inserted, the API returns the existing run and skips the capture. A retried upload can never capture twice.

## Alerts go through a job table (transactional outbox)

When a run takes cells from someone, the capture inserts a row into a `jobs` table in the same transaction. If the capture rolls back, the job never existed, so nobody gets an alert for a steal that didn't happen. There's one job per runner who lost cells, not one per cell, so a big steal sends one alert: "kabir took 166 cells of your ground".

A separate worker polls the table and claims jobs with `FOR UPDATE SKIP LOCKED`, so several workers can run side by side without processing the same job twice. Failed jobs are retried up to five times.

I considered BullMQ on Redis. It would add a second place where important state lives and lose the "only if the transaction committed" guarantee unless I built an outbox anyway. At this volume a Postgres table is simpler.

## Leaderboards in Redis sorted sets

Ranking by area needs "how many players have more ground than me", which in SQL is a count or a scan on every request. A Redis sorted set keeps members ordered: `ZADD` updates a score and `ZREVRANK` returns a rank, both O(log N). There's one global set and one per region.

A runner's area is the sum of the areas of the cells they own. Territory is made of whole cells, so this is exact. I used to trace each owner's outline and add up polygon areas, but that counted holes (a rival's cells inside your territory) as yours.

Scores are updated right after the capture commits, without blocking the response. If that update fails, the leaderboard is briefly stale but ownership in Postgres is still correct, and `npm run db:reconcile` rebuilds Redis from Postgres. A capture should never fail just because Redis is down.

The top-50 list is cached for 5 seconds, so a burst of page loads costs one database query (for usernames) per 5 seconds. I first had 30 seconds, but then the leaderboard didn't reflect a capture you'd just made, which felt broken.

## Map viewport: range query on cell centres

The map asks "which owned cells are in this rectangle?". With 150 m cells I listed every geohash in the viewport and queried `WHERE geohash = ANY(...)`. At precision 8 that's tens of thousands of strings per request, so now it's `WHERE center_lat BETWEEN ... AND center_lng BETWEEN ...` on a B-tree index over `(center_lat, center_lng)`. Only owned cells are stored, so the result is small. On the client, each owner's cells are merged into one outline (shared edges cancel out), so the map draws a few polygons instead of thousands of squares.

## Auth: short-lived access token plus a refresh cookie

Login returns a JWT access token that lasts 15 minutes and is kept in memory (React state), never in `localStorage`, so injected script can't read it from storage. A 7-day refresh token sits in an `httpOnly` cookie that JavaScript can't read at all. When an API call gets a 401, the axios interceptor calls `/auth/refresh` and retries.

Logging out bumps a `token_version` on the user, and refresh tokens carry the version they were issued with, so old refresh tokens stop working immediately. Access tokens are checked without a database lookup, which keeps protected routes fast.

## Rate limiting: fixed window in Redis

Login, register and run uploads are rate-limited with a fixed-window counter (`INCR` + `EXPIRE`). It's one Redis round trip, and all API instances share the counters. If Redis is down the limiter lets traffic through rather than taking the site down.

Login is limited per IP and email (5 attempts per 15 minutes). Keying by IP alone meant everyone behind one network shared a single allowance, which blocked a demo after a few logins.

A sliding window would smooth out bursts at window edges, but for login and upload protection the simpler counter is enough.

## Feed: keyset pagination

The feed shows runs from you and the people you follow, newest first, each with how many cells it claimed. It pages with a cursor (`WHERE created_at < :cursor`) instead of `OFFSET`, so page 50 costs the same as page 1, and new runs arriving don't shift or duplicate items between pages. An index on `territory_captures(run_id)` keeps the per-run cell count cheap.

## Basemap tiles

The map uses OpenStreetMap tiles, desaturated with a CSS filter on the tile layer only so territory colours stand out. I originally used CARTO's dark basemap, but it now requires an API key and shows a watermark without one.

## Demo data

There are two seed scripts. `db:seed` builds a small world around the IIT Guwahati campus: seven runners replay twelve runs over five days through the real capture code, so steals, alerts, the feed and the leaderboard are all genuine. `db:seed:scale` bulk-inserts 5,000 users and 50,000 runs, and is what the `EXPLAIN ANALYZE` numbers in [database.md](database.md) were measured on.
