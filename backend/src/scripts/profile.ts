import { pool } from '../config/db';

async function profile() {
  console.log('--- Profiling Queries ---');

  try {
    // Pick a random user that has runs and follows
    const userRes = await pool.query('SELECT id FROM users LIMIT 10');
    const userIds = userRes.rows.map((r) => r.id);
    const userId = userIds[0];
    const followerId = userIds[1];

    console.log(`\n\n=== 1. Run History Pagination ===`);
    const q1 = `
      EXPLAIN ANALYZE
      SELECT * FROM runs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const res1 = await pool.query(q1, [userId]);
    console.log(res1.rows.map((r) => r['QUERY PLAN']).join('\n'));

    console.log(`\n\n=== 2. Territory Bbox Lookup ===`);
    const q2 = `
      EXPLAIN ANALYZE
      SELECT * FROM territories
      WHERE geohash = ANY($1)
    `;
    // We pass an array of geohashes (which mimics ngeohash.bboxes)
    const res2 = await pool.query(q2, [['9q8yyk', '9q8yym', '9q8yyq', '9q8yyw']]);
    console.log(res2.rows.map((r) => r['QUERY PLAN']).join('\n'));

    console.log(`\n\n=== 3. Feed Generation ===`);
    const q3 = `
      EXPLAIN ANALYZE
      WITH followed_users AS (
        SELECT followee_id FROM follows WHERE follower_id = $1
      ),
      recent_runs AS (
        SELECT r.id::text, r.user_id, 'run' as type, r.created_at
        FROM runs r
        JOIN followed_users f ON r.user_id = f.followee_id
        ORDER BY r.created_at DESC
        LIMIT 20
      ),
      recent_captures AS (
        SELECT c.id::text, c.user_id, 'capture' as type, c.captured_at as created_at
        FROM territory_captures c
        JOIN followed_users f ON c.user_id = f.followee_id
        ORDER BY c.captured_at DESC
        LIMIT 20
      )
      SELECT * FROM (
        SELECT * FROM recent_runs
        UNION ALL
        SELECT * FROM recent_captures
      ) combined
      ORDER BY created_at DESC
      LIMIT 20
    `;
    const res3 = await pool.query(q3, [followerId]);
    console.log(res3.rows.map((r) => r['QUERY PLAN']).join('\n'));

    console.log(`\n\n=== 4. Leaderboard Hydration (Mocking redis fetch) ===`);
    // Simulate finding 10 user IDs from Redis
    const q4 = `
      EXPLAIN ANALYZE
      SELECT id, username, display_name 
      FROM users 
      WHERE id = ANY($1)
    `;
    const res4 = await pool.query(q4, [userIds]);
    console.log(res4.rows.map((r) => r['QUERY PLAN']).join('\n'));
  } catch (err) {
    console.error('Error profiling:', err);
  } finally {
    pool.end();
  }
}

profile();
