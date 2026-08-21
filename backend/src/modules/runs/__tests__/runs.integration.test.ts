import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';

const app = createApp();

describe('Runs Integration', () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    // Clear out test data
    await pool.query(
      'DELETE FROM run_points WHERE run_id IN (SELECT id FROM runs WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))',
      ['%@runs.test.com']
    );
    await pool.query(
      'DELETE FROM runs WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      ['%@runs.test.com']
    );
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@runs.test.com']);

    // Register test user
    const res = await request(app).post('/api/auth/register').send({
      username: 'runstester',
      email: 'user@runs.test.com',
      password: 'password123',
    });

    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const generatePoints = (count: number) => {
    const points = [];
    const baseDate = new Date('2023-01-01T10:00:00Z').getTime();
    for (let i = 0; i < count; i++) {
      points.push({
        lat: 37.7749 + i * 0.001,
        lng: -122.4194 + i * 0.001,
        recordedAt: new Date(baseDate + i * 120000).toISOString(),
      });
    }
    return points;
  };

  describe('POST /api/runs', () => {
    const clientRunId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const points = generatePoints(5);
    const startedAt = points[0].recordedAt;

    it('returns 401 if not authenticated', async () => {
      await request(app).post('/api/runs').send({ clientRunId, startedAt, points }).expect(401);
    });

    it('fails validation on invalid clientRunId', async () => {
      const res = await request(app)
        .post('/api/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientRunId: 'not-a-uuid', startedAt, points })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('fails validation if points are empty', async () => {
      await request(app)
        .post('/api/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientRunId, startedAt, points: [] })
        .expect(400);
    });

    it('creates a new run and computes stats', async () => {
      const res = await request(app)
        .post('/api/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientRunId, startedAt, points })
        .expect(201);

      expect(res.body.run.client_run_id).toBe(clientRunId);
      expect(res.body.run.user_id).toBe(userId);
      expect(parseFloat(res.body.run.distance_meters)).toBeGreaterThan(0);
      expect(res.body.run.duration_seconds).toBe(480); // 5 points, 2m apart = 8 minutes duration
      expect(parseFloat(res.body.run.avg_pace_sec_per_km)).toBeGreaterThan(0);
    });

    it('is idempotent: returns existing run if clientRunId is reused', async () => {
      const res = await request(app)
        .post('/api/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientRunId, startedAt, points })
        .expect(201);

      expect(res.body.run.client_run_id).toBe(clientRunId);

      // Ensure only 1 run was actually created for this user
      const { rows } = await pool.query('SELECT count(*) FROM runs WHERE client_run_id = $1', [
        clientRunId,
      ]);
      expect(parseInt(rows[0].count)).toBe(1);
    });
  });

  describe('GET /api/runs', () => {
    it('returns a paginated list of runs', async () => {
      const res = await request(app)
        .get('/api/runs?limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body.runs)).toBe(true);
      expect(res.body.runs.length).toBeGreaterThan(0);
      // nextCursor should be null since we only have 1 run
      expect(res.body.nextCursor).toBeNull();
    });
  });

  describe('GET /api/runs/:id', () => {
    let runId: string;
    const denseClientRunId = 'd9b9c9f9-e9a9-49c9-b9d9-c9a9e9f9c9b9';

    beforeAll(async () => {
      // Create a massive run to test simplification
      const densePoints = [];
      const baseDate = new Date().getTime();
      for (let i = 0; i < 100; i++) {
        densePoints.push({
          lat: 37.7 + i * 0.0001, // Basically a straight line
          lng: -122.4 + i * 0.0001,
          recordedAt: new Date(baseDate + i * 20000).toISOString(),
        });
      }

      const res = await request(app)
        .post('/api/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientRunId: denseClientRunId,
          startedAt: densePoints[0].recordedAt,
          points: densePoints,
        })
        .expect(201);

      runId = res.body.run.id;
    });

    it('returns the raw points when simplify=false', async () => {
      const res = await request(app)
        .get(`/api/runs/${runId}?simplify=false`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.run.id).toBe(runId);
      expect(res.body.pointCount).toBe(100);
      expect(res.body.simplifiedPointCount).toBe(100);
      expect(res.body.points.length).toBe(100);
    });

    it('returns significantly fewer points when simplify=true for a straight line', async () => {
      const res = await request(app)
        .get(`/api/runs/${runId}?simplify=true&tolerance=5`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.run.id).toBe(runId);
      expect(res.body.pointCount).toBe(100);
      // Since it's a perfectly straight line, DP should reduce it to just 2 points!
      expect(res.body.simplifiedPointCount).toBe(2);
      expect(res.body.points.length).toBe(2);
    });

    it('returns 404 for a non-existent run', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      await request(app)
        .get(`/api/runs/${fakeUuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
