import { pool } from '../../config/db';
import { getGeohashesInBbox } from './geohash';

export interface Territory {
  geohash: string;
  owner_id: string;
  captured_run_id: string | null;
  owner_username: string; // from JOIN
  captured_at: Date;
  center_lat: number;
  center_lng: number;
}

export async function getTerritoriesInBbox(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<{
  territories: Territory[];
  runPolygons: Record<string, { lat: number; lng: number }[]>;
}> {
  // 1. Determine which geohash cells fall within the requested viewport
  const targetHashes = getGeohashesInBbox(minLat, minLng, maxLat, maxLng);

  if (targetHashes.length === 0) {
    return { territories: [], runPolygons: {} };
  }

  // Cap the maximum number of hashes we query at once to prevent abusive massive queries
  // 5000 cells is roughly a 10km x 10km box at precision 7, plenty for a screen viewport
  const maxHashes = 5000;
  const queryHashes =
    targetHashes.length > maxHashes ? targetHashes.slice(0, maxHashes) : targetHashes;

  // 2. Fetch those cells from the DB, joining with users to get the owner's username
  const { rows } = await pool.query(
    `SELECT t.geohash, t.owner_id, t.captured_run_id, t.captured_at, t.center_lat, t.center_lng, u.username as owner_username
     FROM territories t
     JOIN users u ON t.owner_id = u.id
     WHERE t.geohash = ANY($1)`,
    [queryHashes]
  );

  const territories = rows as Territory[];

  // 3. Fetch unique path polygons for the captured_run_ids in the viewport
  const runIds = [...new Set(territories.map((t) => t.captured_run_id).filter(Boolean))];
  const runPolygons: Record<string, { lat: number; lng: number }[]> = {};

  if (runIds.length > 0) {
    const { rows: runRows } = await pool.query(
      `SELECT id, path_polygon FROM runs WHERE id = ANY($1) AND path_polygon IS NOT NULL`,
      [runIds]
    );
    for (const r of runRows) {
      runPolygons[r.id] = r.path_polygon;
    }
  }

  return { territories, runPolygons };
}

export async function getTerritoryByGeohash(geohash: string): Promise<Territory | null> {
  const { rows } = await pool.query(
    `SELECT t.geohash, t.owner_id, t.captured_at, t.center_lat, t.center_lng, u.username as owner_username
     FROM territories t
     JOIN users u ON t.owner_id = u.id
     WHERE t.geohash = $1`,
    [geohash]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0] as Territory;
}

export async function getCaptureHistory(geohash: string) {
  const { rows } = await pool.query(
    `SELECT tc.id, tc.run_id, tc.user_id, tc.captured_at, u.username
     FROM territory_captures tc
     JOIN territories t ON tc.territory_id = t.id
     JOIN users u ON tc.user_id = u.id
     WHERE t.geohash = $1
     ORDER BY tc.captured_at DESC`,
    [geohash]
  );
  return rows;
}

export async function getMyTerritories(userId: string): Promise<Territory[]> {
  const { rows } = await pool.query(
    `SELECT t.geohash, t.owner_id, t.captured_at, t.center_lat, t.center_lng, u.username as owner_username
     FROM territories t
     JOIN users u ON t.owner_id = u.id
     WHERE t.owner_id = $1`,
    [userId]
  );
  return rows as Territory[];
}
