# Scalability

> **Status**: Placeholder — updated as load characteristics are identified

## Current Phase

Phase 1 targets local development only. No production infrastructure decisions have been finalized.

## Anticipated Bottlenecks

| Component | Concern | Planned Mitigation |
|---|---|---|
| Territory queries | Geospatial fan-out per run | PostGIS GiST indexes, H3 pre-computation |
| Leaderboard reads | High-frequency ranking reads | Redis Sorted Sets as primary read source |
| GPS track ingestion | Large payload writes | Async queue, batch inserts |
| Notifications | Fan-out to many followers | Background workers, Redis Pub/Sub |

## Horizontal Scaling Path

The modular monolith is designed to be split into microservices if a specific module becomes a bottleneck. Modules share no in-process state (all shared state lives in Postgres or Redis), making extraction straightforward.

_Detailed load estimates, SLOs, and infrastructure diagrams will be added in Phase 10+._
