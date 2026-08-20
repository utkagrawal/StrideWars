/**
 * Integration tests for Database Layer
 *
 * Runs against real Docker infrastructure. Assumes migrations are applied.
 * Run with: npm run test:integration
 */
import { pool, withTransaction } from '../config/db';

jest.setTimeout(15_000);

describe('Database Integration', () => {
  // Pool is ended globally in jest.setup.ts

  describe('withTransaction helper', () => {
    it('commits successfully when no error is thrown', async () => {
      // Use a temporary table so we don't mutate real tables
      const setupClient = await pool.connect();
      await setupClient.query('CREATE TEMP TABLE IF NOT EXISTS tx_test (id INT, val TEXT)');
      setupClient.release();

      await withTransaction(async (txClient) => {
        await txClient.query("INSERT INTO tx_test (id, val) VALUES (1, 'success')");
      });

      const { rows } = await pool.query<{ id: number; val: string }>(
        'SELECT * FROM tx_test WHERE id = 1'
      );
      expect(rows.length).toBe(1);
      expect(rows[0].val).toBe('success');
    });

    it('rolls back when an error is thrown', async () => {
      const setupClient = await pool.connect();
      await setupClient.query('CREATE TEMP TABLE IF NOT EXISTS tx_test_rb (id INT, val TEXT)');
      setupClient.release();

      const expectedError = new Error('Test rollback error');
      await expect(
        withTransaction(async (txClient) => {
          await txClient.query("INSERT INTO tx_test_rb (id, val) VALUES (2, 'fail')");
          throw expectedError;
        })
      ).rejects.toThrow(expectedError);

      const { rows } = await pool.query('SELECT * FROM tx_test_rb WHERE id = 2');
      expect(rows.length).toBe(0);
    });
  });

  describe('Schema Migrations', () => {
    it('should have all 8 expected tables created', async () => {
      const { rows } = await pool.query<{ table_name: string }>(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
      `);

      const tableNames = rows.map((r) => r.table_name);
      const expectedTables = [
        'users',
        'runs',
        'run_points',
        'territories',
        'territory_captures',
        'follows',
        'notifications',
        'jobs',
      ];

      expectedTables.forEach((table) => {
        expect(tableNames).toContain(table);
      });
    });
  });
});
