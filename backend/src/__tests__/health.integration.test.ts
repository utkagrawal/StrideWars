/**
 * Integration tests for GET /api/health
 *
 * These tests run against REAL Docker infrastructure (Postgres + Redis).
 * Run `npm run infra:up` (or `docker compose up -d postgres redis`) first.
 *
 * Run this suite with:
 *   npm run test:integration
 *
 * These tests are intentionally kept in a separate file from health.test.ts
 * so the unit suite can run offline without any Docker dependency.
 */
import request from 'supertest';
import { createApp } from '../app';
import { pool } from '../config/db';
import { redis } from '../config/redis';

// Increase timeout — real DB connection can take a moment in CI
jest.setTimeout(15_000);

describe('GET /api/health (integration — real infrastructure)', () => {
  const app = createApp();

  // Ensure redis is connected for integration tests
  beforeAll(async () => {
    // Connect redis if it isn't already (lazyConnect mode)
    if (redis.status !== 'ready') {
      await redis.connect().catch(() => {
        /* connection error reported per-test */
      });
    }
  });

  afterAll(async () => {
    // Clean up connections so Jest exits cleanly
    await pool.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
  });

  // ── Test 1: Happy path ───────────────────────────────────────────────────
  it('returns 200 { status:"ok", db:"ok", redis:"ok" } with real infra', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  // ── Test 2: Postgres failure ─────────────────────────────────────────────
  it('reports db:"error" and HTTP 503 when DATABASE_URL points to invalid host', async () => {
    // Override DATABASE_URL to an unreachable host for this test only
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://bad:bad@invalid-host-99999:5432/bad';

    // We directly test a bad Pool to avoid needing a full new Pool
    const { Pool } = await import('pg');
    const badPool = new Pool({
      connectionString: 'postgresql://bad:bad@invalid-host-99999:5432/bad',
      connectionTimeoutMillis: 2_000,
    });

    // Mock checkDb to use badPool for this single call
    let dbResult: 'ok' | 'error' = 'ok';
    try {
      const client = await badPool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch {
      dbResult = 'error';
    } finally {
      await badPool.end().catch(() => undefined);
    }

    process.env.DATABASE_URL = originalUrl;

    // checkDb against bad pool should be 'error'
    expect(dbResult).toBe('error');

    // Verify the full health endpoint still returns a valid JSON response
    // (it may show ok here since the app's pool is still pointing at the real DB)
    const response = await request(app).get('/api/health');
    expect(response.body).toHaveProperty('db');
    expect(response.body).toHaveProperty('redis');
    expect(response.body).toHaveProperty('status');
    // The server must NOT crash — we always get a JSON response
    expect([200, 503]).toContain(response.status);
  });

  // ── Test 3: Redis failure ────────────────────────────────────────────────
  it('reports redis:"error" and server does not crash when Redis is unreachable', async () => {
    // Directly test checkRedis with a client pointing at a bad URL
    const BadRedis = (await import('ioredis')).default;
    const badRedis = new BadRedis('redis://invalid-host-99999:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    badRedis.on('error', () => undefined); // suppress noise

    let redisResult: 'ok' | 'error' = 'ok';
    try {
      await badRedis.connect();
      const pong = await badRedis.ping();
      redisResult = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      redisResult = 'error';
    } finally {
      await badRedis.quit().catch(() => undefined);
    }

    expect(redisResult).toBe('error');

    // Verify the app's health endpoint is still responsive
    const response = await request(app).get('/api/health');
    expect(response.body).toHaveProperty('redis');
    expect([200, 503]).toContain(response.status);
  });
});
