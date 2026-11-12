import { pool } from '../../config/db';

export interface Territory {
  geohash: string;
  owner_id: string;
  captured_run_id: string | null;
  owner_username: string; // from JOIN
  captured_at: Date;
  center_lat: number;
  center_lng: number;
}

/** Safety cap so a zoomed-out request can't return an unbounded number of rows. */
const MAX_CELLS_PER_VIEWPORT = 20_000;

/**
 * Owned cells whose centre falls inside the map viewport.
 *
 * A plain range query on (center_lat, center_lng), served by a B-tree index. We only
 * store cells someone has claimed, so this returns owned ground and nothing else.
 */
export async function getTerritoriesInBbox(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<{ territories: Territory[]; truncated: boolean }> {
  const { rows } = await pool.query(
    `SELECT t.geohash, t.owner_id, t.captured_run_id, t.captured_at,
            t.center_lat, t.center_lng, u.username AS owner_username
     FROM territories t
     JOIN users u ON t.owner_id = u.id
     WHERE t.center_lat BETWEEN $1 AND $3
       AND t.center_lng BETWEEN $2 AND $4
     LIMIT $5`,
    [minLat, minLng, maxLat, maxLng, MAX_CELLS_PER_VIEWPORT + 1]
  );

  const truncated = rows.length > MAX_CELLS_PER_VIEWPORT;
  return { territories: rows.slice(0, MAX_CELLS_PER_VIEWPORT) as Territory[], truncated };
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
