import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';
// Unused import removed
import crypto from 'crypto';

const app = createApp();

describe('Territory Capture Integration', () => {
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let user3Token: string;
  let user3Id: string;

  beforeAll(async () => {
    // 1. Clean up & Setup 3 users
    await pool.query('DELETE FROM territory_captures');
    await pool.query('DELETE FROM territories');
    await pool.query('DELETE FROM run_points');
    await pool.query('DELETE FROM runs');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@capturetest.com']);

    const res1 = await request(app).post('/api/auth/register').send({
      username: 'captureuser1',
      email: 'u1@capturetest.com',
      password: 'password123',
    });
    user1Token = res1.body.accessToken;
    user1Id = res1.body.user.id;

    const res2 = await request(app).post('/api/auth/register').send({
      username: 'captureuser2',
      email: 'u2@capturetest.com',
      password: 'password123',
    });
    user2Token = res2.body.accessToken;
    user2Id = res2.body.user.id;

    const res3 = await request(app).post('/api/auth/register').send({
      username: 'captureuser3',
      email: 'u3@capturetest.com',
      password: 'password123',
    });
    user3Token = res3.body.accessToken;
    user3Id = res3.body.user.id;
  });

  // Pool teardown handled globally

  afterAll(async () => {
    await pool.end();
  });

  it('captures cells enclosed by a polygon', async () => {
    // Create a square run (~550m x 450m)
    const pt1 = { lat: 37.0, lng: -122.0 };
    const pt2 = { lat: 37.005, lng: -122.0 };
    const pt3 = { lat: 37.005, lng: -122.005 };
    const pt4 = { lat: 37.0, lng: -122.005 };

    const points = [
      { ...pt1, recordedAt: '2023-01-01T10:00:00Z' },
      { ...pt2, recordedAt: '2023-01-01T10:00:10Z' },
      { ...pt3, recordedAt: '2023-01-01T10:00:20Z' },
      { ...pt4, recordedAt: '2023-01-01T10:00:30Z' },
    ];

    const clientRunId = crypto.randomUUID();
    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201);

    // We expect it to capture cells inside this ~12,000 m^2 square
    expect(res.body.capturedTerritories.length).toBeGreaterThan(0);
    expect(res.body.enclosedAreaSquareMeters).toBeGreaterThan(10000);
  });

  it('safely handles concurrent capturing of overlapping cells without deadlocking', async () => {
    // 3 users run the exact same square at the exact same time
    const run1Points = [
      { lat: 38.0, lng: -122.0, recordedAt: '2023-01-01T10:00:00Z' },
      { lat: 38.005, lng: -122.0, recordedAt: '2023-01-01T10:00:10Z' },
      { lat: 38.005, lng: -122.005, recordedAt: '2023-01-01T10:00:20Z' },
      { lat: 38.0, lng: -122.005, recordedAt: '2023-01-01T10:00:30Z' },
    ];

    const run2Points = [...run1Points].reverse(); // User 2 ran it backwards
    const run3Points = [run1Points[2], run1Points[3], run1Points[0], run1Points[1]]; // User 3 started at point C

    // Fire concurrently
    const p1 = request(app).post('/api/runs').set('Authorization', `Bearer ${user1Token}`).send({
      clientRunId: crypto.randomUUID(),
      startedAt: run1Points[0].recordedAt,
      points: run1Points,
    });

    const p2 = request(app).post('/api/runs').set('Authorization', `Bearer ${user2Token}`).send({
      clientRunId: crypto.randomUUID(),
      startedAt: run2Points[0].recordedAt,
      points: run2Points,
    });

    const p3 = request(app).post('/api/runs').set('Authorization', `Bearer ${user3Token}`).send({
      clientRunId: crypto.randomUUID(),
      startedAt: run3Points[0].recordedAt,
      points: run3Points,
    });

    // Wait for all 3 to finish. If there's a deadlock, Postgres will abort one with a 500 error.
    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res3.status).toBe(201);

    expect(res1.body.capturedTerritories.length).toBeGreaterThan(0);
    expect(res1.body.capturedTerritories.length).toEqual(res2.body.capturedTerritories.length);
    expect(res1.body.capturedTerritories.length).toEqual(res3.body.capturedTerritories.length);

    // All cells should be owned by someone
    const hashes = res1.body.capturedTerritories.map((t: any) => t.geohash);
    const { rows } = await pool.query(
      'SELECT DISTINCT owner_id FROM territories WHERE geohash = ANY($1)',
      [hashes]
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect([user1Id, user2Id, user3Id]).toContain(rows[0].owner_id);
  });

  it('is idempotent and does not double-capture on replay', async () => {
    const points = [
      { lat: 39.0, lng: -122.0, recordedAt: '2023-01-01T10:00:00Z' },
      { lat: 39.005, lng: -122.0, recordedAt: '2023-01-01T10:00:10Z' },
      { lat: 39.005, lng: -122.005, recordedAt: '2023-01-01T10:00:20Z' },
      { lat: 39.0, lng: -122.005, recordedAt: '2023-01-01T10:00:30Z' },
    ];
    const clientRunId = crypto.randomUUID();

    const res1 = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201);

    const count = res1.body.capturedTerritories.length;
    expect(count).toBeGreaterThan(0);

    // Replay exact same request
    const res2 = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201); // Still 201 Created (idempotency)

    // Should return 0 captured territories
    expect(res2.body.capturedTerritories).toHaveLength(0);
  });

  it('rejects runs with an area greater than 5,000,000 m^2 with 422', async () => {
    // 1 degree is roughly 111km. 1 degree square is ~12,321,000,000 m^2
    const points = [
      { lat: 39.0, lng: -122.0, recordedAt: '2023-01-01T10:00:00Z' },
      { lat: 40.0, lng: -122.0, recordedAt: '2023-01-01T10:00:10Z' },
      { lat: 40.0, lng: -123.0, recordedAt: '2023-01-01T10:00:20Z' },
      { lat: 39.0, lng: -123.0, recordedAt: '2023-01-01T10:00:30Z' },
    ];
    const clientRunId = crypto.randomUUID();

    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/maximum allowed/);
  });

  it('gracefully handles a straight line (zero area)', async () => {
    const points = [
      { lat: 39.0, lng: -122.0, recordedAt: '2023-01-01T10:00:00Z' },
      { lat: 39.001, lng: -122.0, recordedAt: '2023-01-01T10:00:10Z' },
      { lat: 39.002, lng: -122.0, recordedAt: '2023-01-01T10:00:20Z' },
    ];
    const clientRunId = crypto.randomUUID();

    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201);

    expect(res.body.capturedTerritories).toHaveLength(0);
    expect(res.body.enclosedAreaSquareMeters).toBe(0);
  });
});
