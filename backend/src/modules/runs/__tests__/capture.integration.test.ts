import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';
import { encodeGeohash } from '../../territories/geohash';
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

  it('captures multiple distinct cells correctly (and dedupes)', async () => {
    // Create a run that stays in one spot for a few points, then moves
    const pt1 = { lat: 37.0, lng: -122.0 };
    const pt2 = { lat: 37.1, lng: -122.1 };
    const hash1 = encodeGeohash(pt1.lat, pt1.lng);
    const hash2 = encodeGeohash(pt2.lat, pt2.lng);

    const points = [
      { ...pt1, recordedAt: '2023-01-01T10:00:00Z' },
      { ...pt1, recordedAt: '2023-01-01T10:00:10Z' }, // Same hash, should be deduped
      { ...pt2, recordedAt: '2023-01-01T10:00:20Z' },
    ];

    const clientRunId = crypto.randomUUID();
    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201);
    
    // We should only have 2 captures because of dedup
    expect(res.body.capturedTerritories).toHaveLength(2);
    
    // Both should be in the returned array
    const capturedHashes = res.body.capturedTerritories.map((t: any) => t.geohash);
    expect(capturedHashes).toContain(hash1);
    expect(capturedHashes).toContain(hash2);

    // Verify DB state
    const { rows } = await pool.query('SELECT owner_id FROM territories WHERE geohash = ANY($1)', [[hash1, hash2]]);
    expect(rows).toHaveLength(2);
    expect(rows[0].owner_id).toBe(user1Id);
    expect(rows[1].owner_id).toBe(user1Id);
  });

  it('safely handles concurrent capturing of overlapping cells without deadlocking', async () => {
    // User 1 runs North: cells A, B, C
    // User 2 runs South: cells C, B, A
    // User 3 runs random: cells B, A, C
    // If not sorted, locking A then B vs C then B will cause a circular deadlock in PostgreSQL.
    
    const ptA = { lat: 38.0, lng: -122.0 }; // Cell A
    const ptB = { lat: 38.01, lng: -122.0 }; // Cell B
    const ptC = { lat: 38.02, lng: -122.0 }; // Cell C

    const hashA = encodeGeohash(ptA.lat, ptA.lng);
    const hashB = encodeGeohash(ptB.lat, ptB.lng);
    const hashC = encodeGeohash(ptC.lat, ptC.lng);

    // We know these hashes are different, but we don't know their lexicographical order natively.
    // The server will sort them.

    const run1Points = [
      { ...ptA, recordedAt: '2023-01-01T10:00:00Z' },
      { ...ptB, recordedAt: '2023-01-01T10:00:10Z' },
      { ...ptC, recordedAt: '2023-01-01T10:00:20Z' },
    ];

    const run2Points = [
      { ...ptC, recordedAt: '2023-01-01T10:00:00Z' }, // Reversed order for user 2
      { ...ptB, recordedAt: '2023-01-01T10:00:10Z' },
      { ...ptA, recordedAt: '2023-01-01T10:00:20Z' },
    ];

    const run3Points = [
      { ...ptB, recordedAt: '2023-01-01T10:00:00Z' }, // Scrambled order for user 3
      { ...ptA, recordedAt: '2023-01-01T10:00:10Z' },
      { ...ptC, recordedAt: '2023-01-01T10:00:20Z' },
    ];

    // Fire concurrently
    const p1 = request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: run1Points[0].recordedAt, points: run1Points });
    
    const p2 = request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: run2Points[0].recordedAt, points: run2Points });

    const p3 = request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user3Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: run3Points[0].recordedAt, points: run3Points });

    // Wait for all 3 to finish. If there's a deadlock, Postgres will abort one with a 500 error.
    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res3.status).toBe(201);

    expect(res1.body.capturedTerritories).toHaveLength(3);
    expect(res2.body.capturedTerritories).toHaveLength(3);
    expect(res3.body.capturedTerritories).toHaveLength(3);

    // Check DB state: one of them won the race for each cell.
    // Since "last update wins", all 3 cells will belong to whichever transaction committed last.
    const { rows } = await pool.query('SELECT DISTINCT owner_id FROM territories WHERE geohash = ANY($1)', [[hashA, hashB, hashC]]);
    
    // There should only be 1 distinct owner for all 3 cells (or 2/3 if interleaved perfectly, but valid execution either way)
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect([user1Id, user2Id, user3Id]).toContain(rows[0].owner_id);

    // Check that territory_captures has exactly 9 entries for these hashes (3 for u1, 3 for u2, 3 for u3)
    const { rows: captures } = await pool.query(`
      SELECT count(*) 
      FROM territory_captures tc 
      JOIN territories t ON tc.territory_id = t.id 
      WHERE t.geohash = ANY($1)
    `, [[hashA, hashB, hashC]]);
    expect(parseInt(captures[0].count)).toBe(9);
  });

  it('is idempotent and does not double-capture on replay', async () => {
    const pt = { lat: 39.0, lng: -122.0 };
    const hash = encodeGeohash(pt.lat, pt.lng);
    const clientRunId = crypto.randomUUID();
    const points = [{ ...pt, recordedAt: '2023-01-01T10:00:00Z' }];

    const res1 = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201);
    
    expect(res1.body.capturedTerritories).toHaveLength(1);

    const { rows: initialCaptures } = await pool.query(`
      SELECT count(*) 
      FROM territory_captures tc 
      JOIN territories t ON tc.territory_id = t.id 
      WHERE t.geohash = $1
    `, [hash]);
    expect(parseInt(initialCaptures[0].count)).toBe(1);

    // Replay exact same request
    const res2 = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ clientRunId, startedAt: points[0].recordedAt, points })
      .expect(201); // Still 201 Created (idempotency)

    // Should return 0 captured territories
    expect(res2.body.capturedTerritories).toHaveLength(0);

    // DB capture count should still be 1
    const { rows: finalCaptures } = await pool.query(`
      SELECT count(*) 
      FROM territory_captures tc 
      JOIN territories t ON tc.territory_id = t.id 
      WHERE t.geohash = $1
    `, [hash]);
    expect(parseInt(finalCaptures[0].count)).toBe(1);
  });
});
