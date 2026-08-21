import request from 'supertest';
import { createApp } from '../app';
import { pool } from '../config/db';
import crypto from 'crypto';

const app = createApp();

async function runLoadTest() {
  const NUM_USERS = 10;
  console.log(`Starting load test with ${NUM_USERS} concurrent claim attempts...`);

  const users: { id: string, token: string }[] = [];

  // Setup users
  for (let i = 0; i < NUM_USERS; i++) {
    const email = `loadtest${i}@test.com`;
    // Clean up from previous runs
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    
    const res = await request(app).post('/api/auth/register').send({
      username: `loaduser${i}`,
      email,
      password: 'password123',
    });
    
    users.push({ id: res.body.user.id, token: res.body.accessToken });
  }

  console.log('Users created. Preparing requests...');

  // Target a single square bounding a specific cell
  const points = [
    { lat: 40.000, lng: -120.000, recordedAt: new Date().toISOString() },
    { lat: 40.005, lng: -120.000, recordedAt: new Date(Date.now() + 10000).toISOString() },
    { lat: 40.005, lng: -120.005, recordedAt: new Date(Date.now() + 20000).toISOString() },
    { lat: 40.000, lng: -120.005, recordedAt: new Date(Date.now() + 30000).toISOString() }
  ];

  // Fire all requests concurrently
  const promises = users.map((u, i) => {
    // Reverse/shift the points slightly so they aren't completely identical identical replays 
    // but cover the exact same area.
    const shiftedPoints = points.map(p => ({
      ...p,
      lat: p.lat + (Math.random() * 0.0001),
      recordedAt: new Date(Date.now() + i * 1000).toISOString()
    }));
    
    return request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ clientRunId: crypto.randomUUID(), startedAt: shiftedPoints[0].recordedAt, points: shiftedPoints });
  });

  const startTime = Date.now();
  const results = await Promise.all(promises);
  const endTime = Date.now();

  console.log(`Completed in ${endTime - startTime}ms.`);

  let successCount = 0;
  const capturedGeohashes = new Set<string>();

  for (const res of results) {
    if (res.status === 201) {
      successCount++;
      for (const t of res.body.capturedTerritories) {
        capturedGeohashes.add(t.geohash);
      }
    } else {
      console.error('Request failed:', res.status, res.body);
    }
  }

  console.log(`${successCount}/${NUM_USERS} requests succeeded with 201 Created.`);

  // Verify data integrity
  if (capturedGeohashes.size > 0) {
    const hashes = Array.from(capturedGeohashes);
    const { rows } = await pool.query(`
      SELECT geohash, owner_id 
      FROM territories 
      WHERE geohash = ANY($1)
    `, [hashes]);

    let integrityErrors = 0;
    for (const hash of hashes) {
      const owners = rows.filter(r => r.geohash === hash);
      if (owners.length > 1) {
        console.error(`ERROR: Geohash ${hash} has multiple owners!`, owners);
        integrityErrors++;
      } else if (owners.length === 0) {
        console.error(`ERROR: Geohash ${hash} has no owner despite being claimed!`);
        integrityErrors++;
      } else if (!users.find(u => u.id === owners[0].owner_id)) {
        console.error(`ERROR: Geohash ${hash} is owned by an unknown user!`);
        integrityErrors++;
      }
    }

    if (integrityErrors === 0) {
      console.log('✅ DATA INTEGRITY VERIFIED: All claimed cells have exactly one valid owner with no corruption.');
    } else {
      console.error('❌ DATA INTEGRITY FAILED!');
      process.exit(1);
    }
  } else {
    console.error('No territories were captured at all.');
    process.exit(1);
  }

  // Cleanup
  for (const u of users) {
    await pool.query('DELETE FROM users WHERE id = $1', [u.id]);
  }
  await pool.end();
}

runLoadTest().catch(console.error);
