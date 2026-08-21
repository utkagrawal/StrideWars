import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';
import { redis } from '../../../config/redis';
import ngeohash from 'ngeohash';

const app = createApp();

describe('Leaderboards Integration', () => {
  let u1Token: string;
  let u1Id: string;
  
  beforeAll(async () => {
    // We assume Redis is running and connected (part of global setup).
    // Flush the leaderboard for test isolation.
    await redis.del('leaderboard:global');
    await redis.del('leaderboard:cache:global');

    await pool.query('DELETE FROM jobs');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM territory_captures');
    await pool.query('DELETE FROM territories');
    await pool.query('DELETE FROM run_points');
    await pool.query('DELETE FROM runs');
    await pool.query('DELETE FROM follows');
    await pool.query('DELETE FROM users WHERE email LIKE $1 OR username LIKE $2', ['%@lbtest.com', 'lbuser%']);
    
    const r1 = await request(app).post('/api/auth/register').send({
      username: 'lbuser1',
      email: 'u1@lbtest.com',
      password: 'password123',
    });
    if (r1.status !== 201) console.error('REGISTER FAILED:', JSON.stringify(r1.body, null, 2));
    u1Token = r1.body.accessToken;
    u1Id = r1.body.user.id;

    await request(app).post('/api/auth/register').send({
      username: 'lbuser2',
      email: 'u2@lbtest.com',
      password: 'password123',
    });
  });

  afterAll(async () => {
    await pool.end();
    // await redis.quit(); // Assuming global teardown handles this
  });

  it('initially returns an empty leaderboard', async () => {
    const res = await request(app).get('/api/leaderboards/global').expect(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it('updates the leaderboard when a user captures territories via run upload', async () => {
    const points = [
      { lat: 37.000, lng: -122.000, ele: 10, recordedAt: '2023-01-01T10:00:01Z' },
      { lat: 37.005, lng: -122.000, ele: 10, recordedAt: '2023-01-01T10:00:11Z' },
      { lat: 37.005, lng: -122.005, ele: 10, recordedAt: '2023-01-01T10:00:21Z' },
      { lat: 37.000, lng: -122.005, ele: 10, recordedAt: '2023-01-01T10:00:31Z' }
    ];
    
    // Upload run for u1
    const runRes = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${u1Token}`)
      .send({ clientRunId: require('crypto').randomUUID(), startedAt: '2023-01-01T10:00:00Z', points });
    if (runRes.status !== 201) console.error('RUN UPLOAD FAILED:', JSON.stringify(runRes.body, null, 2));
    expect(runRes.status).toBe(201);
    
    // Redis update is async (post-commit), so give it 50ms
    await new Promise(resolve => setTimeout(resolve, 50));

    const res = await request(app).get('/api/leaderboards/global').expect(200);
    
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].userId).toBe(u1Id);
    expect(res.body.entries[0].territoryCount).toBe(runRes.body.capturedTerritories.length);
    expect(res.body.entries[0].rank).toBe(1);
    expect(res.body.entries[0].username).toBe('lbuser1');
    
    // Check /me
    const meRes = await request(app)
      .get('/api/leaderboards/global/me')
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
    expect(meRes.body.rank).toBe(1);
    expect(meRes.body.areaSquareMeters).toBeGreaterThan(0);
  });

  describe('Regional Leaderboards with Dynamic Reverse Geocoding', () => {
    let originalFetch: typeof global.fetch;

    beforeAll(() => {
      originalFetch = global.fetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('returns a geohash prefix and unknown region if fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const res = await request(app)
        .get('/api/leaderboards/region?lat=26.1878&lng=91.6916')
        .expect(200);
      
      // 26.1878, 91.6916 corresponds to 'wh8'
      expect(res.body.prefix).toBe(ngeohash.encode(26.1878, 91.6916, 3));
      expect(res.body.regionName).toBe('Unknown Region');
      expect(Array.isArray(res.body.entries)).toBe(true);
    });

    it('reverse geocodes location correctly if address is available', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          address: {
            city: 'Guwahati',
            state: 'Assam'
          }
        })
      });
      
      const res = await request(app)
        .get('/api/leaderboards/region?lat=26.1878&lng=91.6916')
        .expect(200);
      
      expect(res.body.regionName).toBe('Guwahati');
      expect(res.body.prefix).toBe(ngeohash.encode(26.1878, 91.6916, 3));
      expect(Array.isArray(res.body.entries)).toBe(true);
    });

    it('returns 400 if lat/lng are missing and geohashPrefix is absent', async () => {
      const res = await request(app).get('/api/leaderboards/region');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing/);
    });
  });
});
