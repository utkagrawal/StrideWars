# API Reference

> **Status**: Placeholder — endpoints documented per phase

## Conventions

- All routes are prefixed with `/api`
- Request/response bodies are JSON
- Authentication via `Authorization: Bearer <token>` (Phase 3+)
- Errors follow the shape: `{ "error": string, "code": string }`

## Phase 1 Endpoints

### Health Check

```
GET /api/health
```

**Response** `200 OK`
```json
{ "status": "ok" }
```

---

_Full endpoint documentation will be added as modules are implemented._
