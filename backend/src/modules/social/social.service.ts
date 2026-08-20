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
  await pool.query(
    `DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`,
    [followerId, followeeId]
  );
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
  type: 'run' | 'capture';
  itemId: string;
  userId: string;
  username: string;
  geohash: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  timestamp: string;
}

export async function getFeed(userId: string, cursor?: string, limit: number = 20): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const params: any[] = [userId];
  let cursorClause = '';
  
  if (cursor) {
    cursorClause = 'AND timestamp_val < $2';
    params.push(cursor);
  }
  
  params.push(limit + 1); // For nextCursor
  const limitParamIndex = params.length;

  const query = `
    WITH followed_users AS (
      SELECT followee_id FROM follows WHERE follower_id = $1
    ),
    feed_events AS (
      SELECT 
        'run' as type,
        r.id::text as item_id,
        r.user_id,
        u.username,
        null::text as geohash,
        r.distance_meters,
        r.duration_seconds,
        r.created_at as timestamp_val
      FROM runs r
      JOIN users u ON r.user_id = u.id
      WHERE r.user_id IN (SELECT followee_id FROM followed_users)
      
      UNION ALL
      
      SELECT 
        'capture' as type,
        tc.id::text as item_id,
        tc.user_id,
        u.username,
        t.geohash,
        null::numeric as distance_meters,
        null::integer as duration_seconds,
        tc.captured_at as timestamp_val
      FROM territory_captures tc
      JOIN territories t ON tc.territory_id = t.id
      JOIN users u ON tc.user_id = u.id
      WHERE tc.user_id IN (SELECT followee_id FROM followed_users)
    )
    SELECT * FROM feed_events
    WHERE true ${cursorClause}
    ORDER BY timestamp_val DESC
    LIMIT $${limitParamIndex}
  `;

  const { rows } = await pool.query(query, params);

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    nextCursor = rows[limit].timestamp_val.toISOString();
    rows.pop();
  }

  const items: FeedItem[] = rows.map(row => ({
    type: row.type,
    itemId: row.item_id,
    userId: row.user_id,
    username: row.username,
    geohash: row.geohash,
    distanceMeters: row.distance_meters ? parseFloat(row.distance_meters) : null,
    durationSeconds: row.duration_seconds ? parseInt(row.duration_seconds, 10) : null,
    timestamp: row.timestamp_val.toISOString()
  }));

  return { items, nextCursor };
}
