import { pool } from '../../config/db';
import { claimAndProcessJob } from '../index';

describe('Background Worker Integration (FOR UPDATE SKIP LOCKED)', () => {
  const previousOwnerId = '00000000-0000-0000-0000-000000000000';
  const newOwnerId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM jobs');
    await pool.query('DELETE FROM users WHERE id = $1 OR id = $2', [previousOwnerId, newOwnerId]);
    await pool.query(
      `
      INSERT INTO users (id, username, email, password_hash)
      VALUES
        ($1, 'worker_prev_owner', 'worker_prev_owner@test.com', 'test_hash'),
        ($2, 'worker_new_owner', 'worker_new_owner@test.com', 'test_hash')
      `,
      [previousOwnerId, newOwnerId]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM jobs');
  });

  it('safely handles concurrent worker instances polling the same job', async () => {
    // 1. Insert a single job
    await pool.query(
      `
      INSERT INTO jobs (type, payload) 
      VALUES ($1, $2)
    `,
      [
        'territory_lost_notification',
        {
          previousOwnerId,
          newOwnerId,
          geohash: 'gbsuv7y',
        },
      ]
    );

    // 2. Simulate two worker loops waking up at the exact same time
    const p1 = claimAndProcessJob();
    const p2 = claimAndProcessJob();

    const [res1, res2] = await Promise.all([p1, p2]);

    // 3. One should have claimed and processed it (true), the other should have seen 0 rows and skipped (false)
    // They cannot BOTH return true.
    expect([res1, res2]).toContain(true);
    expect([res1, res2]).toContain(false);
    expect(res1 !== res2).toBe(true);

    // 4. Verify only one notification was created
    const { rows } = await pool.query('SELECT * FROM notifications');
    expect(rows.length).toBe(1);

    // 5. Verify the job is marked as 'done'
    const { rows: jobRows } = await pool.query('SELECT * FROM jobs');
    expect(jobRows.length).toBe(1);
    expect(jobRows[0].status).toBe('done');
    expect(jobRows[0].attempts).toBe(1);
  });
});
