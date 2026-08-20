import { pool } from '../config/db';
import { connectRedis } from '../config/redis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 5;

async function processJob(job: any): Promise<void> {
  const { type, payload } = job;
  
  if (type === 'territory_lost_notification') {
    const { previousOwnerId, newOwnerId, geohash } = payload;
    
    // Create the notification
    const notificationPayload = {
      message: `You lost territory ${geohash} to another player!`,
      geohash,
      lostToUserId: newOwnerId,
    };
    
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, $2, $3)`,
      [previousOwnerId, 'territory_lost', notificationPayload]
    );
  } else {
    console.warn(`[Worker] Unknown job type: ${type}`);
  }
}

async function claimAndProcessJob() {
  const client = await pool.connect();
  let jobId: string | null = null;
  
  try {
    // 1. Claim a job atomically using FOR UPDATE SKIP LOCKED
    await client.query('BEGIN');
    
    const { rows } = await client.query(`
      UPDATE jobs 
      SET status = 'processing', attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs 
        WHERE status = 'pending' 
        ORDER BY created_at ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    
    if (rows.length === 0) {
      // No pending jobs
      await client.query('COMMIT');
      return false; 
    }
    
    const job = rows[0];
    jobId = job.id;
    await client.query('COMMIT');
    
    // 2. Process the job
    await processJob(job);
    
    // 3. Mark as done
    await pool.query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [jobId]);
    return true; // We processed a job, might be more
    
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    
    if (jobId) {
      try {
        const { rows } = await pool.query(`SELECT attempts FROM jobs WHERE id = $1`, [jobId]);
        if (rows.length > 0 && rows[0].attempts >= MAX_ATTEMPTS) {
          await pool.query(`UPDATE jobs SET status = 'failed' WHERE id = $1`, [jobId]);
          console.error(`[Worker] Job ${jobId} failed permanently after ${MAX_ATTEMPTS} attempts.`);
        } else {
          await pool.query(`UPDATE jobs SET status = 'pending' WHERE id = $1`, [jobId]);
          console.error(`[Worker] Job ${jobId} failed, marked for retry.`);
        }
      } catch (markErr) {
        console.error(`[Worker] Failed to mark job ${jobId} status after error:`, markErr);
      }
    }
    console.error(`[Worker] Error processing job:`, err);
    return false;
  } finally {
    client.release();
  }
}

async function workerLoop() {
  console.log('[Worker] Started listening for jobs...');
  while (true) {
    try {
      // If we processed a job, loop immediately to process the next one.
      // If no job was found, wait POLL_INTERVAL_MS.
      const processed = await claimAndProcessJob();
      if (!processed) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error('[Worker] Loop error:', err);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

async function start() {
  await connectRedis(); // Initialize redis if needed
  
  // Test DB connection
  await pool.query('SELECT 1');
  console.log('[Worker] Connected to PostgreSQL');
  
  workerLoop();
}

// Only run if called directly
if (require.main === module) {
  start().catch(err => {
    console.error('[Worker] Startup failed:', err);
    process.exit(1);
  });
}

// Export for testing
export { processJob, claimAndProcessJob };
