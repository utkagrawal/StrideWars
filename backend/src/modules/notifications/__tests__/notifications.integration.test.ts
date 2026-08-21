import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';
import crypto from 'crypto';
import { claimAndProcessJob } from '../../../worker';

const app = createApp();

describe('Notifications & Background Worker Integration', () => {
  let u1Token: string;
  let u2Token: string;
  
  beforeAll(async () => {
    await pool.query('DELETE FROM jobs');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM territory_captures');
    await pool.query('DELETE FROM territories');
    await pool.query('DELETE FROM run_points');
    await pool.query('DELETE FROM runs');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@notiftest.com']);
    
    // User 1
    const r1 = await request(app).post('/api/auth/register').send({
      username: 'notuser1',
      email: 'u1@notiftest.com',
      password: 'password123',
    });
    u1Token = r1.body.accessToken;

    // User 2
    const r2 = await request(app).post('/api/auth/register').send({
      username: 'notuser2',
      email: 'u2@notiftest.com',
      password: 'password123',
    });
    u2Token = r2.body.accessToken;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enqueues a job when territory is recaptured, processes it, and serves the notification', async () => {
    // 1. User 1 captures territory
    const points1 = [
      { lat: 37.000, lng: -122.000, recordedAt: new Date(Date.now() - 10000).toISOString() },
      { lat: 37.005, lng: -122.000, recordedAt: new Date(Date.now() - 9000).toISOString() },
      { lat: 37.005, lng: -122.005, recordedAt: new Date(Date.now() - 8000).toISOString() },
      { lat: 37.000, lng: -122.005, recordedAt: new Date(Date.now() - 7000).toISOString() }
    ];
    const r1 = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${u1Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: points1[0].recordedAt, points: points1 })
      .expect(201);
    console.log('USER 1 CAPTURED:', r1.body.capturedTerritories);
      
    // 2. User 2 recaptures same territory
    const points2 = points1.map(p => ({ ...p, recordedAt: new Date(new Date(p.recordedAt).getTime() + 20000).toISOString() }));
    const r2 = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${u2Token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: points2[0].recordedAt, points: points2 })
      .expect(201);
    console.log('USER 2 CAPTURED:', r2.body.capturedTerritories);
      
    // 3. Verify a pending job was created
    const { rows: jobs } = await pool.query(`SELECT * FROM jobs`);
    console.log('ALL JOBS FOUND:', jobs);
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    expect(pendingJobs.length).toBeGreaterThan(0);
    const notifJob = jobs.find(j => j.type === 'territory_lost_notification');
    expect(notifJob).toBeDefined();
    
    // 4. Run the worker function directly
    const processed = await claimAndProcessJob();
    expect(processed).toBe(true);
    
    // 5. Verify the job is now 'done'
    const { rows: doneJobs } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [notifJob!.id]);
    expect(doneJobs[0].status).toBe('done');
    
    // 6. User 1 checks their notifications API
    const resNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
      
    expect(resNotifs.body.notifications.length).toBeGreaterThan(0);
    expect(resNotifs.body.notifications[0].type).toBe('territory_lost');
    expect(resNotifs.body.notifications[0].readAt).toBeNull();
    
    const notifId = resNotifs.body.notifications[0].id;
    
    // 7. Check unread count
    const unreadRes = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
    expect(unreadRes.body.count).toBeGreaterThan(0);
    
    // 8. Mark as read
    const readRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${u1Token}`)
      .expect(200);
    expect(readRes.body.notification.readAt).not.toBeNull();
  });

  it('safely handles concurrent claim requests using FOR UPDATE SKIP LOCKED', async () => {
    await pool.query('DELETE FROM jobs');
    // Insert a dummy job manually
    await pool.query(`INSERT INTO jobs (type, payload) VALUES ('dummy_test', '{}')`);
    
    const { rows: beforeRows } = await pool.query('SELECT id, type, status FROM jobs');
    console.log('JOBS BEFORE CONCURRENT CLAIM:', beforeRows);

    // Attempt to claim it concurrently multiple times
    const promises = [
      claimAndProcessJob(),
      claimAndProcessJob(),
      claimAndProcessJob()
    ];
    
    const results = await Promise.all(promises);
    console.log('RESULTS OF CONCURRENT CLAIM:', results);
    
    const { rows: afterRows } = await pool.query('SELECT id, type, status FROM jobs');
    console.log('JOBS AFTER CONCURRENT CLAIM:', afterRows);
    
    // Exactly one should return true (claimed), the rest should return false
    const claimedCount = results.filter(r => r === true).length;
    expect(claimedCount).toBe(1);
  });
});
