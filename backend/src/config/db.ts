import { Pool, PoolClient } from 'pg';
import { env } from './env';

// ── Connection pool ─────────────────────────────────────────────────────────
// A single Pool is created at module load time and reused throughout the
// application's lifetime. pg manages individual client connections internally.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Phase 14 Performance Tuning:
  // For a single Node.js instance, max: 20 is typically optimal because Node's single 
  // thread will CPU-bottleneck before it can actively saturate >20 concurrent queries.
  // If we scale to dozens of Node instances behind a load balancer, this could overwhelm
  // Postgres with idle connections (e.g., 50 pods * 20 = 1000 connections).
  // At that scale, we would deploy PgBouncer in transaction-pooling mode and reduce
  // this node-level max pool size.
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Surface pool-level errors so they don't become unhandled rejections
pool.on('error', (err: Error) => {
  // eslint-disable-next-line no-console
  console.error('[PostgreSQL] Pool error:', err.message);
});

// ── connectDb ───────────────────────────────────────────────────────────────
// Called once at server startup to verify the connection is reachable.
// Logs a warning rather than throwing — this lets the dev server start even
// when Docker isn't up yet (the first /api/health will report the failure).
export async function connectDb(): Promise<void> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    // eslint-disable-next-line no-console
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`⚠️  PostgreSQL unavailable at startup: ${message}`);
    // Do NOT rethrow — server should still start; health check will surface the error.
  } finally {
    client?.release();
  }
}

// ── checkDb ─────────────────────────────────────────────────────────────────
// Used by the health-check route on every request.
// Never throws — returns 'ok' or 'error' so the health handler stays simple.
export async function checkDb(): Promise<'ok' | 'error'> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  } finally {
    client?.release();
  }
}

// ── withTransaction ──────────────────────────────────────────────────────────
// Helper to execute a block of database operations within a transaction.
// Automatically calls BEGIN, and then COMMIT on success or ROLLBACK on error.
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
