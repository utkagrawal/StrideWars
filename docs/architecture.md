# Architecture

> **Status**: Placeholder — updated in Phase 2+

## Overview

StrideWars is a **modular monolith**: a single deployable Express application internally divided into bounded domain modules. Each module owns its routes, controller, service, and repository layer — enforcing separation of concerns without the operational overhead of microservices.

## Module Boundaries

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, JWT issuance & refresh |
| `users` | User profile CRUD, settings |
| `runs` | Run recording, GPS track storage |
| `territories` | Geographic tile ownership & capture |
| `leaderboards` | Ranking computation, point aggregation |
| `social` | Follow graph, activity feed |
| `notifications` | In-app and push notification dispatch |

## Request Flow

```
Client → HTTP → Express Router
                  └── Module Router
                        └── Controller (HTTP parsing)
                              └── Service (business logic)
                                    └── Repository (DB / Redis)
```

## Infrastructure

- **PostgreSQL** — primary relational store
- **Redis** — caching, leaderboard sorted sets, session store
- **Docker Compose** — local dev orchestration (Phase 2)

_Detailed diagrams and sequence flows will be added in subsequent phases._
