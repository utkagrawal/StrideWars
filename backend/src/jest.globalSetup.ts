import { Client } from 'pg';
import { execSync } from 'child_process';
import path from 'path';

// The test DB URL comes from the npm script (Docker Postgres on :5433 by default),
// but can be overridden to point at any local Postgres.
const TEST_DB_URL =
  process.env.DATABASE_URL || 'postgresql://stridewars:changeme@localhost:5433/stridewars_test';

export default async () => {
  // Connect to the server's default `postgres` DB to issue CREATE DATABASE
  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = '/postgres';
  const adminClient = new Client({ connectionString: adminUrl.toString() });

  try {
    await adminClient.connect();

    // We drop and recreate the test db to ensure a clean slate
    await adminClient.query('DROP DATABASE IF EXISTS stridewars_test');
    await adminClient.query('CREATE DATABASE stridewars_test');

    console.log('\\n✅ Test database created successfully');
  } catch (error) {
    console.error('Failed to create test database', error);
    process.exit(1);
  } finally {
    await adminClient.end();
  }

  // Run migrations on the newly created test database
  try {
    console.log('⏳ Running migrations on test database...');
    execSync('npm run migrate:up', {
      env: {
        ...process.env,
        DATABASE_URL: TEST_DB_URL,
        // Clear DOTENV_CONFIG_PATH so node-pg-migrate doesn't load the dev .env
        DOTENV_CONFIG_PATH: '',
      },
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log('✅ Test database migrated successfully');
  } catch (error) {
    console.error('Failed to run migrations on test database', error);
    process.exit(1);
  }
};
