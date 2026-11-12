/**
 * Demo seed: a small, believable world for presenting StrideWars.
 *
 *   npm run db:seed
 *
 * Creates 7 runners around the IIT Guwahati campus and replays ~12 runs over the
 * last five days through the REAL capture pipeline (createRun), so territory
 * ownership, steals, notifications, the feed and the leaderboards are all genuine.
 *
 * Every account uses the password `password123`. The presenter logs in as
 *   demo@stridewars.app / password123
 *
 * For the 50k-run profiling dataset use `npm run db:seed:scale` instead.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import { redis, connectRedis } from '../config/redis';
import { createRun } from '../modules/runs/runs.service';
import { rebuildLeaderboards } from '../modules/leaderboards/leaderboards.service';
import { claimAndProcessJob } from '../worker';
import { destinationPoint, stampAtPace, Point } from '../utils/geo';

export const DEMO_CENTER = { lat: 26.1878, lng: 91.6916 }; // IIT Guwahati
export const DEMO_PASSWORD = 'password123';

const RUNNERS = [
  { username: 'demo', displayName: 'Demo Runner' },
  { username: 'aarav', displayName: 'Aarav Sharma' },
  { username: 'meera', displayName: 'Meera Iyer' },
  { username: 'kabir', displayName: 'Kabir Das' },
  { username: 'zoya', displayName: 'Zoya Khan' },
  { username: 'rohan', displayName: 'Rohan Bora' },
  { username: 'ishita', displayName: 'Ishita Roy' },
] as const;

type Username = (typeof RUNNERS)[number]['username'];

/**
 * The story, in chronological order. Offsets are metres east/north of the campus centre.
 * Later runs that overlap earlier ones steal those cells, which is what creates rivalries.
 */
const RUN_SCRIPT: {
  who: Username;
  east: number;
  north: number;
  radius: number;
  hoursAgo: number;
  paceSecPerKm: number;
}[] = [
  { who: 'meera', east: -520, north: 320, radius: 300, hoursAgo: 120, paceSecPerKm: 310 },
  { who: 'aarav', east: 420, north: 420, radius: 320, hoursAgo: 110, paceSecPerKm: 295 },
  { who: 'kabir', east: 0, north: -480, radius: 290, hoursAgo: 100, paceSecPerKm: 340 },
  { who: 'zoya', east: -320, north: -320, radius: 230, hoursAgo: 90, paceSecPerKm: 360 },
  { who: 'demo', east: 0, north: 0, radius: 300, hoursAgo: 80, paceSecPerKm: 330 },
  { who: 'rohan', east: 650, north: -220, radius: 260, hoursAgo: 70, paceSecPerKm: 380 },
  { who: 'aarav', east: 360, north: 160, radius: 260, hoursAgo: 60, paceSecPerKm: 290 },
  { who: 'ishita', east: -760, north: -60, radius: 220, hoursAgo: 50, paceSecPerKm: 350 },
  { who: 'demo', east: -220, north: 170, radius: 250, hoursAgo: 40, paceSecPerKm: 325 },
  { who: 'kabir', east: 110, north: -230, radius: 270, hoursAgo: 20, paceSecPerKm: 335 },
  { who: 'meera', east: -560, north: 360, radius: 270, hoursAgo: 6, paceSecPerKm: 305 },
  { who: 'zoya', east: -380, north: -260, radius: 200, hoursAgo: 3, paceSecPerKm: 355 },
];

/** Who follows whom (the demo account follows everyone, so its feed is lively). */
const FOLLOWS: [Username, Username][] = [
  ...RUNNERS.filter((r) => r.username !== 'demo').map(
    (r) => ['demo', r.username] as [Username, Username]
  ),
  ['aarav', 'demo'],
  ['kabir', 'demo'],
  ['meera', 'demo'],
  ['aarav', 'kabir'],
  ['kabir', 'aarav'],
  ['meera', 'zoya'],
  ['zoya', 'meera'],
  ['ishita', 'meera'],
  ['rohan', 'aarav'],
];

/** Tiny deterministic PRNG so the demo world is identical on every seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds an organic-looking closed loop (not a perfect circle) around a centre,
 * with a GPS sample roughly every 20 m and a little GPS jitter.
 */
export function buildLoop(center: Point, radius: number, seed: number): Point[] {
  const rand = mulberry32(seed);
  const vertices = 14;
  const phase = rand() * Math.PI * 2;

  const corners: Point[] = [];
  for (let i = 0; i < vertices; i++) {
    const bearing = (360 / vertices) * i;
    const wobble =
      1 + 0.18 * Math.sin(3 * ((bearing * Math.PI) / 180) + phase) + (rand() - 0.5) * 0.12;
    corners.push(destinationPoint(center.lat, center.lng, bearing, radius * wobble));
  }
  corners.push(corners[0]);

  // Densify each edge so the track looks like a real GPS recording.
  const points: Point[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      points.push({
        lat: a.lat + (b.lat - a.lat) * t + (rand() - 0.5) * 0.00003,
        lng: a.lng + (b.lng - a.lng) * t + (rand() - 0.5) * 0.00003,
      });
    }
  }
  points.push({ ...points[0] }); // finish where we started
  return points;
}

function offset(east: number, north: number): Point {
  const northPt = destinationPoint(
    DEMO_CENTER.lat,
    DEMO_CENTER.lng,
    north >= 0 ? 0 : 180,
    Math.abs(north)
  );
  return destinationPoint(northPt.lat, northPt.lng, east >= 0 ? 90 : 270, Math.abs(east));
}

export async function runSeed(): Promise<void> {
  const started = Date.now();
  console.log('🌱 Seeding the StrideWars demo world...');
  await connectRedis();

  // 1. Start from a clean slate.
  await pool.query(`
    TRUNCATE TABLE jobs, notifications, follows, territory_captures,
                   territories, run_points, runs, users
    RESTART IDENTITY CASCADE
  `);

  // 2. Runners.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds = {} as Record<Username, string>;
  for (const runner of RUNNERS) {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [runner.username, `${runner.username}@stridewars.app`, passwordHash, runner.displayName]
    );
    userIds[runner.username] = rows[0].id;
  }
  console.log(`✅ ${RUNNERS.length} runners created`);

  // 3. Social graph.
  for (const [follower, followee] of FOLLOWS) {
    await pool.query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)`, [
      userIds[follower],
      userIds[followee],
    ]);
  }

  // 4. Replay the runs, oldest first, through the real capture pipeline.
  for (const [i, step] of RUN_SCRIPT.entries()) {
    const finishedAt = new Date(Date.now() - step.hoursAgo * 3600 * 1000);
    const loop = buildLoop(offset(step.east, step.north), step.radius, i + 1);
    const points = stampAtPace(loop, step.paceSecPerKm, finishedAt);

    const { run, capturedTerritories } = await createRun(
      userIds[step.who],
      crypto.randomUUID(),
      points[0].recordedAt,
      points
    );

    // createRun stamps rows with NOW(); backdate them so the feed tells a story over days.
    await pool.query(`UPDATE runs SET created_at = $2 WHERE id = $1`, [run.id, finishedAt]);
    await pool.query(`UPDATE territory_captures SET captured_at = $2 WHERE run_id = $1`, [
      run.id,
      finishedAt,
    ]);
    await pool.query(`UPDATE territories SET captured_at = $2 WHERE captured_run_id = $1`, [
      run.id,
      finishedAt,
    ]);

    const stolen = capturedTerritories.filter(
      (t) => t.previousOwnerId && t.previousOwnerId !== userIds[step.who]
    ).length;
    console.log(
      `   ${step.who.padEnd(7)} claimed ${String(capturedTerritories.length).padStart(2)} cells` +
        (stolen ? ` (${stolen} stolen)` : '')
    );
  }

  // 5. Let the background worker turn queued jobs into notifications, then backdate them.
  while (await claimAndProcessJob()) {
    /* drain the queue */
  }
  await pool.query(`
    UPDATE notifications n SET created_at = r.created_at
    FROM runs r WHERE r.id = (n.payload->>'runId')::uuid
  `);
  // Older alerts have already been seen; the most recent ones stay unread.
  await pool.query(
    `UPDATE notifications SET read_at = created_at + interval '1 hour'
     WHERE created_at < NOW() - interval '30 hours'`
  );

  // 6. Leaderboards are derived data: rebuild them from Postgres.
  await new Promise((r) => setTimeout(r, 500)); // let fire-and-forget score updates settle
  await rebuildLeaderboards();

  console.log(`🎉 Demo world ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`   Log in as demo@stridewars.app / ${DEMO_PASSWORD}`);
}

if (require.main === module) {
  runSeed()
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      redis.disconnect();
    });
}
