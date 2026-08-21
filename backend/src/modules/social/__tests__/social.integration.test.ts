import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';
import crypto from 'crypto';

const app = createApp();

describe('Social Integration', () => {
  let u1Token: string;
  let u1Id: string;
  
  let u2Token: string;
  let u2Id: string;

  let u3Token: string;
  let u3Id: string;
  
  beforeAll(async () => {
    await pool.query('DELETE FROM follows');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@socialtest.com']);
    
    // User 1
    const r1 = await request(app).post('/api/auth/register').send({
      username: 'socuser1',
      email: 'u1@socialtest.com',
      password: 'password123',
    });
    u1Token = r1.body.accessToken;
    u1Id = r1.body.user.id;

    // User 2
    const r2 = await request(app).post('/api/auth/register').send({
      username: 'socuser2',
      email: 'u2@socialtest.com',
      password: 'password123',
    });
    u2Token = r2.body.accessToken;
    u2Id = r2.body.user.id;

    // User 3
    const r3 = await request(app).post('/api/auth/register').send({
      username: 'socuser3',
      email: 'u3@socialtest.com',
      password: 'password123',
    });
    u3Token = r3.body.accessToken;
    u3Id = r3.body.user.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('allows following and unfollowing', async () => {
    // 1 follows 2
    const res1 = await request(app)
      .post(`/api/social/follow/${u2Id}`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
    expect(res1.body.following).toBe(true);

    // 2 follows 1
    await request(app)
      .post(`/api/social/follow/${u1Id}`)
      .set('Authorization', `Bearer ${u2Token}`)
      .expect(200);

    // Idempotent follow
    const resIdempotent = await request(app)
      .post(`/api/social/follow/${u2Id}`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
    expect(resIdempotent.body.following).toBe(true);

    // Self follow should be idempotent / ignored
    await request(app)
      .post(`/api/social/follow/${u1Id}`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);

    // Check followers for user 2 (should be user 1)
    const followersRes = await request(app).get(`/api/social/followers/${u2Id}`).expect(200);
    expect(followersRes.body.users).toHaveLength(1);
    expect(followersRes.body.users[0].id).toBe(u1Id);

    // Check following for user 1 (should be user 2)
    const followingRes = await request(app).get(`/api/social/following/${u1Id}`).expect(200);
    expect(followingRes.body.users).toHaveLength(1);
    expect(followingRes.body.users[0].id).toBe(u2Id);

    // Unfollow
    const resUnfollow = await request(app)
      .delete(`/api/social/follow/${u2Id}`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
    expect(resUnfollow.body.following).toBe(false);

    // Re-follow for next tests
    await request(app)
      .post(`/api/social/follow/${u2Id}`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
      
    // 1 follows 3
    await request(app)
      .post(`/api/social/follow/${u3Id}`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
  });

  it('returns a paginated activity feed merging runs and captures', async () => {
    // We need some activity from user 2 and user 3
    
    // User 2 runs
    const points2 = [
      { lat: 38.000, lng: -122.000, recordedAt: new Date(Date.now() - 13000).toISOString() },
      { lat: 38.005, lng: -122.000, recordedAt: new Date(Date.now() - 12000).toISOString() },
      { lat: 38.005, lng: -122.005, recordedAt: new Date(Date.now() - 11000).toISOString() },
      { lat: 38.000, lng: -122.005, recordedAt: new Date(Date.now() - 10000).toISOString() }
    ];
    await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${u2Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: points2[0].recordedAt, points: points2 })
      .expect(201);
      
    // User 3 runs
    const points3 = [
      { lat: 39.000, lng: -122.000, recordedAt: new Date(Date.now() - 8000).toISOString() },
      { lat: 39.005, lng: -122.000, recordedAt: new Date(Date.now() - 7000).toISOString() },
      { lat: 39.005, lng: -122.005, recordedAt: new Date(Date.now() - 6000).toISOString() },
      { lat: 39.000, lng: -122.005, recordedAt: new Date(Date.now() - 5000).toISOString() }
    ];
    await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${u3Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: points3[0].recordedAt, points: points3 })
      .expect(201);

    // User 1 fetches feed
    const resFeed = await request(app)
      .get('/api/social/feed?limit=10')
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);

    // Should have 4 items: 2 runs, 2 captures (one for each run)
    expect(resFeed.body.items.length).toBeGreaterThanOrEqual(4);
    
    // Items should be sorted in descending order of timestamp
    const times = resFeed.body.items.map((i: any) => new Date(i.timestamp).getTime());
    for (let i = 0; i < times.length - 1; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i + 1]);
    }
    
    // Validate shape
    expect(resFeed.body.items[0]).toHaveProperty('type');
    expect(resFeed.body.items[0]).toHaveProperty('username');
    expect(resFeed.body.items[0]).toHaveProperty('userId');
    expect(resFeed.body.items[0]).toHaveProperty('itemId');
  });
});
