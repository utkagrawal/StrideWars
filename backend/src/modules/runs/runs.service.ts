import { pool, withTransaction } from '../../config/db';
import { calculateTotalDistance, calculatePace, autoClosePath, polygonArea } from '../../utils/geo';

export interface RunPointInput {
  lat: number;
  lng: number;
  recordedAt: string; // ISO Date string
}

export interface Run {
  id: string;
  user_id: string;
  client_run_id: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_sec_per_km: number | null;
  started_at: Date;
  created_at: Date;
}

export interface RunPoint {
  id: string; // BIGSERIAL returns string from pg by default for large numbers
  run_id: string;
  seq: number;
  lat: number;
  lng: number;
  recorded_at: Date;
}

import { decodeGeohash, computeIntersectingGeohashes } from '../territories/geohash';
import { updateScores } from '../leaderboards/leaderboards.service';

export async function createRun(
  userId: string,
  clientRunId: string,
  startedAt: string,
  points: RunPointInput[]
): Promise<{
  run: Run;
  capturedTerritories: { geohash: string; previousOwnerId: string | null }[];
  enclosedAreaSquareMeters: number;
}> {
  // Sort points by recordedAt just in case they arrived out of order
  const sortedPoints = [...points].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  // Calculate stats
  const distanceMeters = calculateTotalDistance(sortedPoints);

  // Measure from whichever is earlier: the client's start time or its first GPS fix.
  // (A clock-skewed `startedAt` must never make an honest run look impossibly fast.)
  const startTime = Math.min(
    new Date(startedAt).getTime(),
    new Date(sortedPoints[0].recordedAt).getTime()
  );
  const endTime = new Date(sortedPoints[sortedPoints.length - 1].recordedAt).getTime();
  const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

  const avgPace = calculatePace(distanceMeters, durationSeconds);

  // Spoofing / Abuse Protection (Phase 5)
  // World record marathon pace is ~175 sec/km. Usain Bolt's top sprint is ~58 sec/km.
  // If the average pace is faster than 90 sec/km (40km/h) over a distance > 200m, reject it.
  if (distanceMeters > 200 && avgPace !== null && avgPace < 90) {
    const error = new Error(
      'Run rejected: Average pace is physically impossible on foot. Please turn off your car or GPS spoofer.'
    );
    (error as any).statusCode = 422;
    (error as any).code = 'VALIDATION_ERROR';
    throw error;
  }

  const closedPoints = autoClosePath(sortedPoints, 30);
  const enclosedAreaSquareMeters = polygonArea(closedPoints);

  if (enclosedAreaSquareMeters > 5000000) {
    const error = new Error('Enclosed area exceeds maximum allowed (5 sq km)');
    (error as any).statusCode = 422;
    (error as any).code = 'VALIDATION_ERROR';
    throw error;
  }

  let uniqueHashes: string[] = [];
  if (closedPoints.length >= 4 && enclosedAreaSquareMeters >= 200) {
    uniqueHashes = computeIntersectingGeohashes(closedPoints);
  }

  const result = await withTransaction(async (client) => {
    // 1. Try to insert the run.
    // Uses ON CONFLICT DO NOTHING to handle idempotency via the UNIQUE(user_id, client_run_id) constraint.
    const pathPolygonJson = JSON.stringify(closedPoints);
    const { rows: runRows } = await client.query(
      `INSERT INTO runs (user_id, client_run_id, distance_meters, duration_seconds, avg_pace_sec_per_km, started_at, path_polygon)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, client_run_id) DO NOTHING
       RETURNING *`,
      [userId, clientRunId, distanceMeters, durationSeconds, avgPace, startedAt, pathPolygonJson]
    );

    // 2. If no row was returned, it means the run already exists!
    // Idempotency: We return the existing run but DO NOT process captures again, as they were done on the first successful insert.
    if (runRows.length === 0) {
      const { rows: existingRows } = await client.query(
        `SELECT * FROM runs WHERE user_id = $1 AND client_run_id = $2`,
        [userId, clientRunId]
      );
      // Return empty capturedTerritories since this is a replay of an existing successful run
      return { run: existingRows[0] as Run, capturedTerritories: [], enclosedAreaSquareMeters };
    }

    const run = runRows[0] as Run;

    // 3. Insert points in bulk
    if (sortedPoints.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      let i = 1;

      sortedPoints.forEach((p, index) => {
        placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        values.push(run.id, index, p.lat, p.lng, p.recordedAt);
      });

      await client.query(
        `INSERT INTO run_points (run_id, seq, lat, lng, recorded_at) VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    // 4. Capture territories with a few set-based statements, however big the loop.
    // `uniqueHashes` is sorted and every statement works in that order, so all transactions
    // lock cells in the same global order: two overlapping runs can never deadlock.
    const capturedTerritories: { geohash: string; previousOwnerId: string | null }[] = [];
    const cellsLostByOwner = new Map<string, number>();

    if (uniqueHashes.length > 0) {
      const centers = uniqueHashes.map(decodeGeohash);

      // 4a. Make sure a row exists for every cell (no-op for cells that already exist).
      await client.query(
        `INSERT INTO territories (geohash, center_lat, center_lng, owner_id, captured_at)
         SELECT g, lat, lng, NULL, NOW()
         FROM unnest($1::text[], $2::float8[], $3::float8[]) AS u(g, lat, lng)
         ORDER BY g
         ON CONFLICT (geohash) DO NOTHING`,
        [uniqueHashes, centers.map((c) => c.lat), centers.map((c) => c.lng)]
      );

      // 4b. Lock all the cells (in sorted order) and read who owned each one.
      const { rows: locked } = await client.query(
        `SELECT id, geohash, owner_id FROM territories
         WHERE geohash = ANY($1::text[])
         ORDER BY geohash
         FOR UPDATE`,
        [uniqueHashes]
      );
      const territoryIds: string[] = locked.map((r) => r.id);

      // 4c. Hand every cell to the runner.
      await client.query(
        `UPDATE territories SET owner_id = $2, captured_at = NOW(), captured_run_id = $3
         WHERE id = ANY($1::uuid[])`,
        [territoryIds, userId, run.id]
      );

      // 4d. Append to the capture history (powers the feed and per-cell history).
      await client.query(
        `INSERT INTO territory_captures (territory_id, run_id, user_id)
         SELECT unnest($1::uuid[]), $2, $3`,
        [territoryIds, run.id, userId]
      );

      for (const row of locked) {
        const previousOwnerId: string | null = row.owner_id;
        capturedTerritories.push({ geohash: row.geohash, previousOwnerId });
        if (previousOwnerId && previousOwnerId !== userId) {
          cellsLostByOwner.set(previousOwnerId, (cellsLostByOwner.get(previousOwnerId) ?? 0) + 1);
        }
      }
    }

    // 5. Queue ONE "you lost ground" notification per victim (not one per cell).
    // The job is written in the same transaction, so it only exists if the capture commits
    // (transactional outbox). The background worker turns it into a notification.
    for (const [previousOwnerId, cellsLost] of cellsLostByOwner) {
      await client.query(`INSERT INTO jobs (type, payload) VALUES ($1, $2)`, [
        'territory_lost_notification',
        { previousOwnerId, newOwnerId: userId, runId: run.id, cellsLost },
      ]);
    }

    return { run, capturedTerritories, enclosedAreaSquareMeters };
  });

  // Post-commit: Sync scores to Redis.
  // We fire-and-forget this after the Postgres transaction is fully committed.
  // We map the array to the expected shape.
  const captureEvents = result.capturedTerritories.map((t) => ({
    geohash: t.geohash,
    previousOwnerId: t.previousOwnerId,
    newOwnerId: userId,
  }));

  if (captureEvents.length > 0) {
    // Fire-and-forget: Redis is a derived view, Postgres stays the source of truth.
    // If this fails, `npm run db:reconcile` rebuilds the leaderboards from Postgres.
    updateScores(captureEvents).catch((err) => {
      console.error('Failed post-commit score update:', err);
    });
  }

  return result;
}

export async function getRuns(
  userId: string,
  limit: number = 20,
  cursor?: string
): Promise<{ runs: Run[]; nextCursor: string | null }> {
  let query = `SELECT * FROM runs WHERE user_id = $1`;
  const params: any[] = [userId];

  if (cursor) {
    query += ` AND created_at < $2`;
    params.push(cursor);
  }

  // Request limit + 1 to check if there is a next page
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const { rows } = await pool.query(query, params);

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const nextRow = rows.pop(); // Remove the extra row
    nextCursor = nextRow.created_at.toISOString();
  }

  return { runs: rows as Run[], nextCursor };
}

export async function getRunOwner(id: string): Promise<{ user_id: string } | null> {
  const { rows } = await pool.query(`SELECT user_id FROM runs WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function getRunById(
  userId: string,
  runId: string,
  simplify: boolean = true,
  tolerance: number = 5
): Promise<{
  run: Run;
  points: RunPoint[];
  pointCount: number;
  simplifiedPointCount: number;
} | null> {
  const { rows: runRows } = await pool.query(`SELECT * FROM runs WHERE id = $1 AND user_id = $2`, [
    runId,
    userId,
  ]);

  if (runRows.length === 0) {
    return null;
  }

  const { rows: pointRows } = await pool.query(
    `SELECT * FROM run_points WHERE run_id = $1 ORDER BY seq ASC`,
    [runId]
  );

  let finalPoints = pointRows as RunPoint[];
  const originalCount = finalPoints.length;

  if (simplify && originalCount > 2) {
    const { douglasPeucker } = await import('../../utils/geo');
    finalPoints = douglasPeucker(finalPoints, tolerance);
  }

  return {
    run: runRows[0] as Run,
    points: finalPoints,
    pointCount: originalCount,
    simplifiedPointCount: finalPoints.length,
  };
}

// extractAndSortUniqueTerritories was removed in Phase 16 in favor of polygon captures
