import { pool } from '../config/db';
import { redis, connectRedis } from '../config/redis';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables for the script
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function reconcile() {
  console.log('Starting Leaderboard Reconciliation...');

  await connectRedis();

  console.log('Fetching territory counts from Postgres...');
  const { rows } = await pool.query(`
    SELECT owner_id, count(*) as territory_count
    FROM territories
    WHERE owner_id IS NOT NULL
    GROUP BY owner_id
  `);

  console.log(`Found ${rows.length} users with territories.`);

  // Clear existing global leaderboard
  await redis.del('leaderboard:global');
  await redis.del('leaderboard:cache:global');

  if (rows.length > 0) {
    const pipeline = redis.pipeline();

    for (const row of rows) {
      pipeline.zadd('leaderboard:global', row.territory_count, row.owner_id);
    }

    await pipeline.exec();
    console.log('Successfully repopulated Redis leaderboard:global.');
  } else {
    console.log('No territories found. Redis leaderboard:global is empty.');
  }

  // Close connections
  await redis.quit();
  await pool.end();
  console.log('Reconciliation complete.');
}

reconcile().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
