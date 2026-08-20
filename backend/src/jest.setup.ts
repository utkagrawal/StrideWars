import { connectRedis, redis } from './config/redis';
import { pool } from './config/db';

beforeAll(async () => {
  await connectRedis();

  // Truncate all application tables to ensure isolated test runs per file
  if (pool) {
    await pool.query(`
      TRUNCATE TABLE 
        jobs, notifications, follows, territory_captures, 
        territories, run_points, runs, users 
      RESTART IDENTITY CASCADE
    `).catch(() => undefined);
  }
  
  if (redis) {
    await redis.flushdb();
  }
});

afterAll(async () => {
  if (pool) await pool.end().catch(() => undefined);
  if (redis) await redis.quit().catch(() => undefined);
});
