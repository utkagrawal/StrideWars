import { pool } from '../../config/db';

export async function followUser(followerId: string, followeeId: string): Promise<void> {
  if (followerId === followeeId) {
    return; // idempotent / no-op
  }

  await pool.query(
    `INSERT INTO follows (follower_id, followee_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_id, followee_id) DO NOTHING`,
    [followerId, followeeId]
  );
}

export async function unfollowUser(followerId: string, followeeId: string): Promise<void> {
  await pool.query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [
    followerId,
    followeeId,
  ]);
}

export async function getFollowers(userId: string): Promise<{ id: string; username: string }[]> {
  const { rows } = await pool.query(
    `SELECT u.id, u.username
     FROM follows f
     JOIN users u ON f.follower_id = u.id
     WHERE f.followee_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getFollowing(userId: string): Promise<{ id: string; username: string }[]> {
  const { rows } = await pool.query(
    `SELECT u.id, u.username
     FROM follows f
     JOIN users u ON f.followee_id = u.id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows;
}

export interface FeedItem {
  type: 'run';
  itemId: string; // run id
  userId: string;
  username: string;
  distanceMeters: number;
  durationSeconds: number;
  cellsClaimed: number;
  timestamp: string;
}

/**
 * Activity feed: recent runs by people you follow (and your own), newest first,
 * each with how many map cells it claimed.
 *
 * Uses keyset (cursor) pagination on `created_at` instead of OFFSET, so page N costs
 * the same as page 1 and new runs arriving don't shift or duplicate items.
 */
export async function getFeed(
  userId: string,
  cursor?: string,
  limit: number = 20
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const params: any[] = [userId];
  let cursorClause = '';

  if (cursor) {
    params.push(cursor);
    cursorClause = `AND r.created_at < $${params.length}`;
  }

  params.push(limit + 1); // fetch one extra row to know if there is a next page
  const limitParamIndex = params.length;

  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.user_id,
       u.username,
       r.distance_meters,
       r.duration_seconds,
       r.created_at,
       (SELECT COUNT(*) FROM territory_captures tc WHERE tc.run_id = r.id) AS cells_claimed
     FROM runs r
     JOIN users u ON r.user_id = u.id
     WHERE (r.user_id = $1
            OR r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))
       ${cursorClause}
     ORDER BY r.created_at DESC
     LIMIT $${limitParamIndex}`,
    params
  );

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    nextCursor = rows[rows.length - 1].created_at.toISOString();
  }

  const items: FeedItem[] = rows.map((row) => ({
    type: 'run',
    itemId: row.id,
    userId: row.user_id,
    username: row.username,
    distanceMeters: parseFloat(row.distance_meters),
    durationSeconds: parseInt(row.duration_seconds, 10),
    cellsClaimed: parseInt(row.cells_claimed, 10),
    timestamp: row.created_at.toISOString(),
  }));

  return { items, nextCursor };
}
