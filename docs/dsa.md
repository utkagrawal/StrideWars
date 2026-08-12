# Data Structures & Algorithms

> **Status**: Placeholder — DSA decisions documented per phase

## Territory Capture

The territory system will rely on spatial data structures. Key candidates:

- **H3 Hexagonal Grid** (Uber) — hierarchical hexagonal tiling for representing map cells; O(1) cell lookup, efficient neighbor traversal
- **R-Tree / PostGIS GiST index** — spatial indexing for polygon intersection queries
- **Segment intersection** — used to determine which territory tiles a GPS track passes through

## Leaderboard

- **Redis Sorted Sets** — O(log N) rank insertions and rank queries; ideal for live leaderboard updates
- **Periodic materialization** — computed rankings stored in Postgres for historical snapshots

## Run Processing

- **Ramer–Douglas–Peucker** — polyline simplification to reduce GPS track storage while preserving shape

_Detailed complexity analysis and pseudocode will be added in Phases 4–6._
