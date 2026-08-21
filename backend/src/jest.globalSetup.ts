import { Client } from 'pg';
import { execSync } from 'child_process';
import path from 'path';

export default async () => {
  // Use the default dev postgres db to connect and issue CREATE DATABASE
  const adminClient = new Client({
    connectionString: 'postgresql://stridewars:changeme@localhost:5433/postgres',
  });

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
        DATABASE_URL: 'postgresql://stridewars:changeme@localhost:5433/stridewars_test',
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
