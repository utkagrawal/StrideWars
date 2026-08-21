import request from 'supertest';
import { createApp } from '../app';
import { pool } from '../config/db';
import crypto from 'crypto';
import { encodeGeohash } from '../modules/territories/geohash';

const app = createApp();

jest.setTimeout(20_000);

describe('End-to-End User Journey', () => {
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let user3Token: string;

  beforeAll(async () => {
    // 0. Clean DB
    await pool.query(`
      TRUNCATE TABLE 
        jobs, notifications, follows, territory_captures, 
        territories, run_points, runs, users 
      RESTART IDENTITY CASCADE
    `).catch(() => {});
    
    const timestamp = Date.now();
    
    // 1. Setup 3 users
    const res1 = await request(app).post('/api/auth/register').send({
      username: `e2erunner1${timestamp}`,
      email: `e1_${timestamp}@e2e.com`,
      password: 'password123',
    });
    user1Token = res1.body.accessToken;
    user1Id = res1.body.user.id;

    const res2 = await request(app).post('/api/auth/register').send({
      username: `e2erunner2${timestamp}`,
      email: `e2_${timestamp}@e2e.com`,
      password: 'password123',
    });
    user2Token = res2.body.accessToken;
    user2Id = res2.body.user.id;

    const res3 = await request(app).post('/api/auth/register').send({
      username: `e2efan${timestamp}`,
      email: `e3_${timestamp}@e2e.com`,
      password: 'password123',
    });
    user3Token = res3.body.accessToken;

    // e2e_fan follows e2e_runner1 and e2e_runner2
    await request(app).post(`/api/social/follow/${user1Id}`).set('Authorization', `Bearer ${user3Token}`).expect(200);
    await request(app).post(`/api/social/follow/${user2Id}`).set('Authorization', `Bearer ${user3Token}`).expect(200);
  });

  it('completes the full loop: upload -> capture -> leaderboard -> notify -> feed', async () => {
    // 1. User 1 uploads a run capturing NYC
    const nycHash = encodeGeohash(40.7128, -74.0060);
    const u1ClientRunId = crypto.randomUUID();
    const u1RunRes = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        clientRunId: u1ClientRunId,
        startedAt: new Date().toISOString(),
        points: [
          { lat: 40.7120, lng: -74.0070, recordedAt: new Date(Date.now() - 30000).toISOString() },
          { lat: 40.7140, lng: -74.0070, recordedAt: new Date(Date.now() - 20000).toISOString() },
          { lat: 40.7140, lng: -74.0040, recordedAt: new Date(Date.now() - 10000).toISOString() },
          { lat: 40.7120, lng: -74.0040, recordedAt: new Date().toISOString() }
        ]
      })
      .expect(201);
    
    expect(u1RunRes.body.capturedTerritories.length).toBeGreaterThan(0);
    expect(u1RunRes.body.capturedTerritories.map((t: any) => t.geohash)).toContain(nycHash);

    // Give Redis a moment to process fire-and-forget score update
    await new Promise(r => setTimeout(r, 50));

    // Leaderboard should show User 1 with 1 point
    const lbRes1 = await request(app).get('/api/leaderboards/global').expect(200);
    const u1Rank = lbRes1.body.entries.find((u: any) => u.userId === user1Id);
    expect(u1Rank).toBeDefined();
    expect(u1Rank.territoryCount).toBe(u1RunRes.body.capturedTerritories.length);

    // 2. User 2 uploads a run capturing the SAME territory (recapture)
    const u2ClientRunId = crypto.randomUUID();
    const u2RunRes = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        clientRunId: u2ClientRunId,
        startedAt: new Date().toISOString(),
        points: [
          { lat: 40.7120, lng: -74.0070, recordedAt: new Date(Date.now() - 30000).toISOString() },
          { lat: 40.7140, lng: -74.0070, recordedAt: new Date(Date.now() - 20000).toISOString() },
          { lat: 40.7140, lng: -74.0040, recordedAt: new Date(Date.now() - 10000).toISOString() },
          { lat: 40.7120, lng: -74.0040, recordedAt: new Date().toISOString() }
        ]
      })
      .expect(201);

    expect(u2RunRes.body.capturedTerritories.length).toBeGreaterThan(0);
    expect(u2RunRes.body.capturedTerritories.map((t: any) => t.geohash)).toContain(nycHash);
    
    const recapturedNyc = u2RunRes.body.capturedTerritories.find((t: any) => t.geohash === nycHash);
    expect(recapturedNyc.previousOwnerId).toBe(user1Id); // Crucial!

    await new Promise(r => setTimeout(r, 50));

    // Leaderboard should reflect the swap
    const lbRes2 = await request(app).get('/api/leaderboards/global').expect(200);
    const u2Rank2 = lbRes2.body.entries.find((u: any) => u.userId === user2Id);
    const u1Rank2 = lbRes2.body.entries.find((u: any) => u.userId === user1Id);
    expect(u2Rank2.territoryCount).toBe(u2RunRes.body.capturedTerritories.length);
    expect(u1Rank2?.territoryCount || 0).toBe(0);

    // 3. Trigger worker to process notification job
    // The background worker polls jobs table, but since we're in integration tests without the worker running, 
    // we process the job manually here to simulate the worker.
    const { claimAndProcessJob } = await import('../worker/index');
    while (await claimAndProcessJob()) {}

    // 4. User 1 should have received a notification about losing the territory
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);
    
    expect(notifRes.body.notifications.length).toBeGreaterThanOrEqual(1);
    const lostNotifs = notifRes.body.notifications.filter((n: any) => n.type === 'territory_lost');
    expect(lostNotifs.length).toBeGreaterThanOrEqual(1);
    expect(lostNotifs.map((n: any) => n.payload.geohash)).toContain(nycHash);
    expect(lostNotifs.some((n: any) => n.payload.lostToUserId === user2Id)).toBe(true);

    // 5. User 3 (fan) checks their social feed
    const feedRes = await request(app)
      .get('/api/social/feed')
      .set('Authorization', `Bearer ${user3Token}`)
      .expect(200);
    
    // They should see both run completions and both territory captures
    const feed = feedRes.body.items;
    expect(feed.length).toBeGreaterThanOrEqual(4); // 2 runs + 2 captures minimum
    
    const hasU1Run = feed.some((f: any) => f.type === 'run' && f.userId === user1Id);
    const hasU2Run = feed.some((f: any) => f.type === 'run' && f.userId === user2Id);
    const hasU1Capture = feed.some((f: any) => f.type === 'capture' && f.userId === user1Id);
    const hasU2Capture = feed.some((f: any) => f.type === 'capture' && f.userId === user2Id);

    expect(hasU1Run).toBe(true);
    expect(hasU2Run).toBe(true);
    expect(hasU1Capture).toBe(true);
    expect(hasU2Capture).toBe(true);
  });
});
