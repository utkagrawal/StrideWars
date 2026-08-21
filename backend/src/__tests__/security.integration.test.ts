import request from 'supertest';
import { createApp } from '../app';
import { pool } from '../config/db';
import crypto from 'crypto';
import { redis } from '../config/redis';

const app = createApp();

describe('Security Hardening', () => {
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    // 0. Clean DB
    await pool
      .query(
        `
      TRUNCATE TABLE 
        jobs, notifications, follows, territory_captures, 
        territories, run_points, runs, users 
      RESTART IDENTITY CASCADE
    `
      )
      .catch(() => {});

    // Clean Redis to reset rate limits
    await redis.flushdb();

    const timestamp = Date.now();

    // 1. Setup 2 users
    const res1 = await request(app)
      .post('/api/auth/register')
      .send({
        username: `sec1${timestamp}`,
        email: `sec1_${timestamp}@sec.com`,
        password: 'password123',
      });
    user1Token = res1.body.accessToken;

    const res2 = await request(app)
      .post('/api/auth/register')
      .send({
        username: `sec2${timestamp}`,
        email: `sec2_${timestamp}@sec.com`,
        password: 'password123',
      });
    user2Token = res2.body.accessToken;
  });

  it('enforces rate limiting on login', async () => {
    const timestamp = Date.now();
    const payload = {
      email: `sec1_${timestamp}@sec.com`, // valid format but wrong creds
      password: 'wrongpassword',
    };

    // The limit is 5. We make 5 requests.
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').send(payload);
      expect([401, 404]).toContain(res.status); // Not 429 yet
    }

    // 6th request should be rate limited
    const res = await request(app).post('/api/auth/login').send(payload);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('revokes refresh tokens on logout (token_version)', async () => {
    const timestamp = Date.now();
    const email = `revoke_${timestamp}@sec.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: `revoke${timestamp}`,
        email,
        password: 'password123',
      });

    const cookies = (res.headers['set-cookie'] || []) as string[];
    const refreshTokenCookie = cookies.find((c) => c.startsWith('refreshToken=')) || '';

    // 1. Refresh should work initially
    const refresh1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);
    expect(refresh1.status).toBe(200);

    // 2. Logout (this increments token_version)
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [refreshTokenCookie]);
    expect(logoutRes.status).toBe(200);

    // 3. Attempting to refresh again with the old cookie should fail
    const refresh2 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);
    expect(refresh2.status).toBe(401);
    expect(refresh2.body.error.message).toBe('Token revoked');
  });

  it('enforces resource ownership checks (403 Forbidden)', async () => {
    // Create a run for User 1
    const runRes = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        clientRunId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        points: [{ lat: 10, lng: 20, recordedAt: new Date().toISOString() }],
      });

    // We shouldn't hit rate limit because limit is 10 for runs.
    expect(runRes.status).toBe(201);
    const runId = runRes.body.run.id;

    // User 1 can fetch their run
    const fetch1 = await request(app)
      .get(`/api/runs/${runId}`)
      .set('Authorization', `Bearer ${user1Token}`);
    expect(fetch1.status).toBe(200);

    // User 2 CANNOT fetch User 1's run
    const fetch2 = await request(app)
      .get(`/api/runs/${runId}`)
      .set('Authorization', `Bearer ${user2Token}`);
    expect(fetch2.status).toBe(403);
    expect(fetch2.body.error.code).toBe('FORBIDDEN');
  });
});
