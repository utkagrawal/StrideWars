import { pool, withTransaction } from '../../config/db';
import { calculateTotalDistance, calculatePace, autoClosePath, polygonArea, getPolygonBoundingBox, isPointInPolygon } from '../../utils/geo';

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
): Promise<{ run: Run; capturedTerritories: { geohash: string; previousOwnerId: string | null }[]; enclosedAreaSquareMeters: number }> {
  // Sort points by recordedAt just in case they arrived out of order
  const sortedPoints = [...points].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  // Calculate stats
  const distanceMeters = calculateTotalDistance(sortedPoints);
  
  const startTime = new Date(startedAt).getTime();
  const endTime = new Date(sortedPoints[sortedPoints.length - 1].recordedAt).getTime();
  const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  
  const avgPace = calculatePace(distanceMeters, durationSeconds);

  // Spoofing / Abuse Protection (Phase 5)
  // World record marathon pace is ~175 sec/km. Usain Bolt's top sprint is ~58 sec/km.
  // If the average pace is faster than 90 sec/km (40km/h) over a distance > 200m, reject it.
  if (distanceMeters > 200 && avgPace < 90) {
    const error = new Error('Run rejected: Average pace is physically impossible on foot. Please turn off your car or GPS spoofer.');
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

    // 4. Capture Territories
    const capturedTerritories: { geohash: string; previousOwnerId: string | null }[] = [];
    
    for (const hash of uniqueHashes) {
      const { lat, lng } = decodeGeohash(hash);

      // 1. Ensure the row exists idempotently to avoid UPSERT race conditions
      await client.query(`
        INSERT INTO territories (geohash, owner_id, captured_at, center_lat, center_lng, captured_run_id)
        VALUES ($1, NULL, NOW(), $2, $3, NULL)
        ON CONFLICT (geohash) DO NOTHING
      `, [hash, lat, lng]);

      // 2. Lock the row, read previous owner, and update
      const res = await client.query(`
        WITH old_terr AS (
          SELECT owner_id as previous_owner_id, id as territory_id
          FROM territories
          WHERE geohash = $1 FOR UPDATE
        ),
        updated AS (
          UPDATE territories
          SET owner_id = $2, captured_at = NOW(), captured_run_id = $3
          WHERE geohash = $1 AND (owner_id != $2 OR owner_id IS NULL)
          RETURNING id
        )
        SELECT 
          o.territory_id,
          o.previous_owner_id
        FROM old_terr o
      `, [hash, userId, run.id]);

      const previousOwnerId = res.rows[0]?.previous_owner_id || null;
      const territoryId = res.rows[0].territory_id;
      
      console.log('CAPTURE DEBUG:', res.rows[0]);

      // Log the capture history
      await client.query(
        `INSERT INTO territory_captures (territory_id, run_id, user_id) VALUES ($1, $2, $3)`,
        [territoryId, run.id, userId]
      );

      capturedTerritories.push({ geohash: hash, previousOwnerId });
      
      console.log('CHECKING IF JOB SHOULD ENQUEUE:', { previousOwnerId, userId });

      if (previousOwnerId && previousOwnerId !== userId) {
        console.log('ENQUEUEING JOB for', hash);
        // Enqueue a job to send a notification to the previous owner
        await client.query(
          `INSERT INTO jobs (type, payload) VALUES ($1, $2)`,
          [
            'territory_lost_notification',
            {
              previousOwnerId,
              newOwnerId: userId,
              geohash: hash,
            }
          ]
        );
        const { rows: debugJobs } = await client.query('SELECT * FROM jobs');
        console.log('JOBS INSIDE TX:', debugJobs);
      }
    }

    return { run, capturedTerritories, enclosedAreaSquareMeters };
  });

  // Post-commit: Sync scores to Redis. 
  // We fire-and-forget this after the Postgres transaction is fully committed.
  // We map the array to the expected shape.
  const captureEvents = result.capturedTerritories.map(t => ({
    geohash: t.geohash,
    previousOwnerId: t.previousOwnerId,
    newOwnerId: userId,
  }));
  
  if (captureEvents.length > 0) {
    // Imported dynamically to avoid circular dependencies if any, or just import at top
    updateScores(captureEvents).catch(err => {
      // Already caught in updateScores, but just in case
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
): Promise<{ run: Run; points: RunPoint[]; pointCount: number; simplifiedPointCount: number } | null> {
  const { rows: runRows } = await pool.query(
    `SELECT * FROM runs WHERE id = $1 AND user_id = $2`,
    [runId, userId]
  );

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
