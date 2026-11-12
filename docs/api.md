# API Reference

## Conventions

- All routes are prefixed with `/api`
- Request/response bodies are JSON
- Authentication via `Authorization: Bearer <token>`
- Errors follow the shape: `{ "error": string, "code": string }`

---

## Health Check

**GET `/api/health`**
- **Response**: `200 OK`
  - `{ "status": "ok", "db": "ok", "redis": "ok" }`

---

## Authentication

**POST `/api/auth/register`**
- **Body**: `{ "username": "...", "email": "...", "password": "...", "displayName": "..." }`
- **Response**: `201 Created`
  - `{ "user": { "id", "username", "email", "displayName" }, "accessToken": "..." }`
  - Sets `httpOnly` cookie: `refreshToken`

**POST `/api/auth/login`**
- **Body**: `{ "email": "...", "password": "..." }`
- **Response**: `200 OK`
  - `{ "user": { "id", "username", "email", "displayName" }, "accessToken": "..." }`
  - Sets `httpOnly` cookie: `refreshToken`

**POST `/api/auth/refresh`**
- **Cookies**: `refreshToken` required
- **Response**: `200 OK`
  - `{ "accessToken": "..." }`

**POST `/api/auth/logout`**
- **Response**: `200 OK`
  - Clears `refreshToken` cookie

---

## Users

**GET `/api/users/me`** *(Requires Auth)*
- **Response**: `200 OK`
  - `{ "user": { "id", "username", "email", "displayName" } }`

**PATCH `/api/users/me`** *(Requires Auth)*
- **Body**: `{ "displayName": "..." }`
- **Response**: `200 OK`
  - `{ "user": { ... } }`

**GET `/api/users/:id`**
- **Response**: `200 OK`
  - `{ "user": { "id", "username", "displayName" } }` (email is omitted for privacy)

---

## Runs *(Requires Auth)*

**POST `/api/runs`**
- **Body**: 
  ```json
  { 
    "clientRunId": "uuid", 
    "startedAt": "2023-01-01T10:00:00Z", 
    "points": [
      { "lat": 37.7749, "lng": -122.4194, "recordedAt": "2023-01-01T10:00:01Z" }
    ]
  }
  ```
- **Response**: `201 Created` or `200 OK` (if idempotent replay)
  - `{ "run": { "id", "distance_meters", "duration_seconds", "avg_pace_sec_per_km" } }`
- **Errors**:
  - `422 Unprocessable Entity`: "VALIDATION_ERROR" if the run exceeds 5,000,000 m² enclosed area.
  - `422 Unprocessable Entity`: "VALIDATION_ERROR" (Spoofing Protection) if the average pace is faster than 90 seconds/km (40 km/h) over a distance > 200m, indicating the user is in a vehicle or spoofing GPS.

**GET `/api/runs`**
- **Query**: `?limit=20&cursor=2023-01-01T10:00:00Z`
- **Response**: `200 OK`
  - `{ "runs": [...], "nextCursor": "..." }`

**GET `/api/runs/generate-loop`**
- **Query**: `?lat=26.18&lng=91.69`
- **Response**: `200 OK`
  - `{ "points": [{ "lat": 0, "lng": 0, "recordedAt": "..." }] }`, a loop that follows nearby roads (OpenStreetMap), timestamped at a 5:30 /km pace. Falls back to a generated circle if the map data can't be fetched within 4 s.

**GET `/api/runs/:id`**
- **Query**: `?simplify=true&tolerance=5`
- **Response**: `200 OK`
  - `{ "run": { ... }, "points": [...], "pointCount": 100, "simplifiedPointCount": 50 }`

---

## Territories *(Requires Auth)*

**GET `/api/territories`**
- **Query**: `?bbox=minLat,minLng,maxLat,maxLng`
- **Response**: `200 OK`
  - `{ "territories": [{ "geohash": "...", "owner_id": "...", "owner_username": "...", "captured_at": "...", "center_lat": 0, "center_lng": 0, "captured_run_id": "..." }], "truncated": false }`, the owned cells whose centre is inside the box (capped at 20,000).

**GET `/api/territories/mine`**
- **Response**: `200 OK`
  - `{ "territories": [...] }`, every cell you own.

**GET `/api/territories/:geohash`**
- **Response**: `200 OK`
  - `{ "territory": { "geohash": "...", "owner_id": "...", "owner_username": "...", "captured_at": "...", "center_lat": 0, "center_lng": 0 } }`

**GET `/api/territories/history/:geohash`**
- **Response**: `200 OK`
  - `{ "captures": [{ "id": "...", "run_id": "...", "user_id": "...", "username": "...", "captured_at": "..." }] }`

---

## Leaderboards

**GET `/api/leaderboards/global`**
- **Query**: `?limit=50`
- **Response**: `200 OK`
  - `{ "entries": [{ "userId": "...", "username": "...", "areaSquareMeters": 167401, "rank": 1 }] }`

**GET `/api/leaderboards/global/me`** *(Requires Auth)*
- **Response**: `200 OK`
  - `{ "rank": 1, "areaSquareMeters": 167401 }` (`rank` is `null` if you own nothing)

**GET `/api/leaderboards/region`**
- **Query**: either `?geohashPrefix=wh9&limit=50`, or `?lat=26.18&lng=91.69` to use the region around that point
- **Response**: `200 OK`
  - `{ "entries": [{ "userId": "...", "username": "...", "areaSquareMeters": 167401, "rank": 1 }], "regionName": "Guwahati", "prefix": "wh9" }`

---

## Social *(Requires Auth)*

**POST `/api/social/follow/:userId`**
- **Response**: `200 OK`
  - `{ "following": true }`

**DELETE `/api/social/follow/:userId`**
- **Response**: `200 OK`
  - `{ "following": false }`

**GET `/api/social/followers/:userId`**
- **Response**: `200 OK`
  - `{ "users": [{ "id": "...", "username": "..." }] }`

**GET `/api/social/following/:userId`**
- **Response**: `200 OK`
  - `{ "users": [{ "id": "...", "username": "..." }] }`

**GET `/api/social/feed`**
- **Query**: `?cursor=2023...&limit=20`
- **Response**: `200 OK`
  - `{ "items": [{ "type": "run", "itemId": "<run id>", "userId": "...", "username": "...", "distanceMeters": 1800, "durationSeconds": 612, "cellsClaimed": 339, "timestamp": "..." }], "nextCursor": "..." }`
  - Runs by you and the people you follow, newest first. Pass `nextCursor` back as `cursor` for the next page.

---

## Notifications *(Requires Auth)*

**GET `/api/notifications`**
- **Query**: `?cursor=2023...&limit=20`
- **Response**: `200 OK`
  - `{ "notifications": [{ "id": "...", "type": "territory_lost", "payload": { "message": "kabir took 5 cells of your ground.", "cellsLost": 5, "lostToUserId": "...", "lostToUsername": "kabir", "runId": "..." }, "readAt": null, "createdAt": "..." }], "nextCursor": "..." }`

**GET `/api/notifications/unread-count`**
- **Response**: `200 OK`
  - `{ "count": 5 }`

**PATCH `/api/notifications/:id/read`**
- **Response**: `200 OK`
  - `{ "notification": { ...same shape as above, with readAt set } }`
