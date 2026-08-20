import Redis from 'ioredis';
import { env } from './env';

// ── Redis client ────────────────────────────────────────────────────────────
// lazyConnect: true — the client does NOT connect at construction time.
// We call redis.connect() explicitly in connectRedis() so startup sequencing
// is under our control and the server won't hang if Redis is temporarily down.
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  // Limit reconnect retries so the health check fails fast instead of blocking
  maxRetriesPerRequest: 1,
  // Don't crash the process on connection errors — health check surfaces them
  enableOfflineQueue: false,
});

// Suppress unhandled-rejection noise from ioredis reconnect attempts
redis.on('error', (err: Error) => {
  // eslint-disable-next-line no-console
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  // eslint-disable-next-line no-console
  console.log('✅ Redis connected');
});

// ── connectRedis ────────────────────────────────────────────────────────────
// Called once at server startup. Warns (not throws) if Redis is unreachable.
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Redis unavailable at startup: ${message}`);
    // Do NOT rethrow — health check will surface the error.
  }
}

// ── checkRedis ──────────────────────────────────────────────────────────────
// Used by the health-check route on every request.
// Never throws — returns 'ok' or 'error'.
export async function checkRedis(): Promise<'ok' | 'error'> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
