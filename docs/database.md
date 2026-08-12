# Database Design

> **Status**: Placeholder — schema created in Phase 2

## Engine

**PostgreSQL** (v15+) — chosen for strong ACID guarantees, PostGIS extension support (geospatial territory queries), and excellent Node.js ecosystem (`pg`).

## Planned Tables (High-Level)

| Table | Notes |
|---|---|
| `users` | Profiles, credentials |
| `runs` | Run metadata + PostGIS LineString track |
| `territory_tiles` | H3 hex-grid tile ownership |
| `territory_captures` | Capture events per run |
| `leaderboard_entries` | Materialized ranking rows |
| `follows` | Social graph edges |
| `notifications` | Notification queue |

## Migration Strategy

- **Flyway** or raw SQL migration files in `backend/migrations/`
- One file per migration, named `V{N}__{description}.sql`

_Full DDL, indexes, and ERD will be added in Phase 2._
