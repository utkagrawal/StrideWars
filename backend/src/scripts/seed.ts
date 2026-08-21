import { pool } from '../config/db';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import geohash from 'ngeohash';
import { createRun } from '../modules/runs/runs.service';
import { generateRoadLoop } from '../utils/geo';

const NUM_USERS = 5000;
const RUNS_PER_USER = 10;
const BATCH_SIZE = 1000;

async function seed() {
  console.log(
    `🌱 Seeding database with ${NUM_USERS} users and ${NUM_USERS * RUNS_PER_USER} runs...`
  );
  const startTime = Date.now();

  try {
    // 1. Truncate existing data
    console.log('Clearing existing data...');
    await pool.query(`
      TRUNCATE TABLE 
        jobs, notifications, follows, territory_captures, 
        territories, run_points, runs, users 
      RESTART IDENTITY CASCADE
    `);

    // 2. Generate and Insert Users in batches
    console.log(`Generating ${NUM_USERS} users...`);
    const passwordHash = await bcrypt.hash('password123', 10);
    const userIds: string[] = [];

    for (let i = 0; i < NUM_USERS; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, NUM_USERS - i);
      const values: string[] = [];
      const queryParams: any[] = [];

      for (let j = 0; j < batchSize; j++) {
        const idx = i + j;
        const id = crypto.randomUUID();
        userIds.push(id);

        values.push(`($${j * 5 + 1}, $${j * 5 + 2}, $${j * 5 + 3}, $${j * 5 + 4}, $${j * 5 + 5})`);
        queryParams.push(id, `user${idx}`, `user${idx}@test.com`, passwordHash, `Test User ${idx}`);
      }

      await pool.query(
        `
        INSERT INTO users (id, username, email, password_hash, display_name)
        VALUES ${values.join(',')}
      `,
        queryParams
      );
    }
    console.log('✅ Users inserted.');

    // 3. Generate and Insert Follows (each user follows 5 random other users)
    console.log('Generating follows...');
    const followValues: string[] = [];
    const followParams: any[] = [];
    let paramCount = 1;

    for (const followerId of userIds) {
      // Pick 5 random followees
      const followees = new Set<string>();
      while (followees.size < 5) {
        const randId = userIds[Math.floor(Math.random() * userIds.length)];
        if (randId !== followerId) followees.add(randId);
      }

      for (const followeeId of followees) {
        followValues.push(`($${paramCount}, $${paramCount + 1})`);
        followParams.push(followerId, followeeId);
        paramCount += 2;

        // Execute in batches to avoid pg parameter limits (max 65535)
        if (followParams.length > 20000) {
          await pool.query(
            `INSERT INTO follows (follower_id, followee_id) VALUES ${followValues.join(',')}`,
            followParams
          );
          followValues.length = 0;
          followParams.length = 0;
          paramCount = 1;
        }
      }
    }
    if (followParams.length > 0) {
      await pool.query(
        `INSERT INTO follows (follower_id, followee_id) VALUES ${followValues.join(',')}`,
        followParams
      );
    }
    console.log('✅ Follows inserted.');

    // 4. Generate and Insert Runs & Territories
    console.log(`Generating ${NUM_USERS * RUNS_PER_USER} runs and territories...`);
    const runValues: string[] = [];
    const runParams: any[] = [];
    let runParamCount = 1;

    // We will accumulate captures and insert them
    let runCount = 0;

    for (const userId of userIds) {
      for (let r = 0; r < RUNS_PER_USER; r++) {
        const runId = crypto.randomUUID();
        const clientRunId = crypto.randomUUID();
        const distance = Math.random() * 5000 + 1000;
        const duration = Math.floor(distance / (Math.random() * 2 + 2));

        runValues.push(
          `($${runParamCount}, $${runParamCount + 1}, $${runParamCount + 2}, $${runParamCount + 3}, $${runParamCount + 4}, $${runParamCount + 5})`
        );
        runParams.push(runId, userId, clientRunId, distance, duration, new Date().toISOString());
        runParamCount += 6;

        runCount++;

        if (runParams.length > 20000) {
          await pool.query(
            `
            INSERT INTO runs (id, user_id, client_run_id, distance_meters, duration_seconds, started_at)
            VALUES ${runValues.join(',')}
          `,
            runParams
          );
          runValues.length = 0;
          runParams.length = 0;
          runParamCount = 1;
        }
      }
    }
    if (runParams.length > 0) {
      await pool.query(
        `
        INSERT INTO runs (id, user_id, client_run_id, distance_meters, duration_seconds, started_at)
        VALUES ${runValues.join(',')}
      `,
        runParams
      );
    }
    console.log('✅ Runs inserted.');

    // 5. Fake some territories
    console.log('Generating territories...');
    // Rather than accurately simulating 50k runs worth of points, let's just make 10,000 distinct territories
    const NUM_TERRITORIES = 10000;
    const territoryIds: string[] = [];
    const terrValues: string[] = [];
    const terrParams: any[] = [];
    let terrParamCount = 1;

    for (let t = 0; t < NUM_TERRITORIES; t++) {
      const id = crypto.randomUUID();
      territoryIds.push(id);
      const ownerId = userIds[Math.floor(Math.random() * userIds.length)];

      const lat = 40 + Math.random() * 5;
      const lng = -74 + Math.random() * 5;
      // We append the index to guarantee uniqueness for the geohash since Math.random can theoretically collide
      const gh = geohash.encode(lat, lng, 7).substring(0, 6) + (t % 36).toString(36);

      terrValues.push(
        `($${terrParamCount}, $${terrParamCount + 1}, $${terrParamCount + 2}, $${terrParamCount + 3}, $${terrParamCount + 4})`
      );
      terrParams.push(id, gh, ownerId, lat, lng);
      terrParamCount += 5;

      if (terrParams.length > 20000) {
        // ON CONFLICT just in case of gh collision
        await pool.query(
          `
          INSERT INTO territories (id, geohash, owner_id, center_lat, center_lng)
          VALUES ${terrValues.join(',')}
          ON CONFLICT (geohash) DO NOTHING
        `,
          terrParams
        );
        terrValues.length = 0;
        terrParams.length = 0;
        terrParamCount = 1;
      }
    }
    if (terrParams.length > 0) {
      await pool.query(
        `
        INSERT INTO territories (id, geohash, owner_id, center_lat, center_lng)
        VALUES ${terrValues.join(',')}
        ON CONFLICT (geohash) DO NOTHING
      `,
        terrParams
      );
    }
    console.log('✅ Territories inserted.');

    // Note: We skip run_points and territory_captures to save massive time since the
    // main profiling targets are feed generation (runs + captures) and bbox lookup (territories).
    // Let's actually add some territory_captures to make the feed queries realistic.

    console.log('Generating territory captures...');
    const tcValues: string[] = [];
    const tcParams: any[] = [];
    let tcParamCount = 1;

    // Fetch a sample of runs and territories to associate captures with
    const runsRes = await pool.query(`SELECT id, user_id FROM runs LIMIT 50000`);
    const allRuns = runsRes.rows;

    const terrRes = await pool.query(`SELECT id FROM territories LIMIT 10000`);
    const actualTerritoryIds = terrRes.rows.map((r) => r.id);

    for (let i = 0; i < 50000; i++) {
      const run = allRuns[Math.floor(Math.random() * allRuns.length)];
      const territoryId = actualTerritoryIds[Math.floor(Math.random() * actualTerritoryIds.length)];

      tcValues.push(`($${tcParamCount}, $${tcParamCount + 1}, $${tcParamCount + 2})`);
      tcParams.push(territoryId, run.id, run.user_id);
      tcParamCount += 3;

      if (tcParams.length > 20000) {
        await pool.query(
          `
          INSERT INTO territory_captures (territory_id, run_id, user_id)
          VALUES ${tcValues.join(',')}
        `,
          tcParams
        );
        tcValues.length = 0;
        tcParams.length = 0;
        tcParamCount = 1;
      }
    }
    if (tcParams.length > 0) {
      await pool.query(
        `
        INSERT INTO territory_captures (territory_id, run_id, user_id)
        VALUES ${tcValues.join(',')}
      `,
        tcParams
      );
    }

    console.log('✅ Territory captures inserted.');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🎉 Bulk seeding complete in ${duration}s.`);

    // 6. Generate IIT Guwahati demo users & runs
    console.log('Generating IIT Guwahati demo users and runs...');
    const demoCenter = { lat: 26.1878, lng: 91.6916 }; // IIT Guwahati

    // Spread them out slightly
    const offsets = [
      { dLat: 0.002, dLng: 0.002 },
      { dLat: -0.002, dLng: 0.002 },
      { dLat: 0.002, dLng: -0.002 },
      { dLat: -0.002, dLng: -0.002 },
      { dLat: 0, dLng: 0.003 },
    ];

    for (let i = 0; i < 5; i++) {
      const demoUserId = crypto.randomUUID();
      const demoUsername = `iitg_demo_${i + 1}`;

      await pool.query(
        `
        INSERT INTO users (id, username, email, password_hash, display_name)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [demoUserId, demoUsername, `${demoUsername}@test.com`, passwordHash, `Demo User ${i + 1}`]
      );

      const centerLat = demoCenter.lat + offsets[i].dLat;
      const centerLng = demoCenter.lng + offsets[i].dLng;

      // Generate loop and run it through the real capture pipeline
      const points = await generateRoadLoop(centerLat, centerLng, 300, 800);
      const clientRunId = crypto.randomUUID();
      const startedAt = points[0].recordedAt;

      await createRun(demoUserId, clientRunId, startedAt, points);
    }
    console.log('✅ IIT Guwahati demo data created.');

    // 7. Rebuild Leaderboards to fix raw count scores for bulk-seeded users
    const { rebuildLeaderboards } = await import('../modules/leaderboards/leaderboards.service');
    await rebuildLeaderboards();
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    pool.end();
  }
}

seed();
