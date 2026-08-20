import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Enable pgcrypto for gen_random_uuid()
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  // 2. Users table
  pgm.sql(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // 3. Runs table
  pgm.sql(`
    CREATE TABLE runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      client_run_id UUID NOT NULL,
      distance_meters NUMERIC NOT NULL,
      duration_seconds INTEGER NOT NULL,
      avg_pace_sec_per_km NUMERIC,
      started_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, client_run_id)
    );
  `);

  // 4. Run Points table
  pgm.sql(`
    CREATE TABLE run_points (
      id BIGSERIAL PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX run_points_run_id_seq_idx ON run_points(run_id, seq);
  `);

  // 5. Territories table
  pgm.sql(`
    CREATE TABLE territories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      geohash TEXT UNIQUE NOT NULL,
      owner_id UUID REFERENCES users(id),
      captured_at TIMESTAMPTZ,
      center_lat DOUBLE PRECISION NOT NULL,
      center_lng DOUBLE PRECISION NOT NULL
    );
    CREATE INDEX territories_geohash_idx ON territories(geohash);
    CREATE INDEX territories_owner_id_idx ON territories(owner_id);
  `);

  // 6. Territory Captures table
  pgm.sql(`
    CREATE TABLE territory_captures (
      id BIGSERIAL PRIMARY KEY,
      territory_id UUID NOT NULL REFERENCES territories(id),
      run_id UUID NOT NULL REFERENCES runs(id),
      user_id UUID NOT NULL REFERENCES users(id),
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // 7. Follows table
  pgm.sql(`
    CREATE TABLE follows (
      follower_id UUID NOT NULL REFERENCES users(id),
      followee_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(follower_id, followee_id)
    );
  `);

  // 8. Notifications table
  pgm.sql(`
    CREATE TABLE notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX notifications_user_id_unread_idx ON notifications(user_id) WHERE read_at IS NULL;
  `);

  // 9. Jobs table
  pgm.sql(`
    CREATE TABLE jobs (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX jobs_status_idx ON jobs(status);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop tables in reverse order of dependencies
  pgm.sql(`DROP TABLE IF EXISTS jobs;`);
  pgm.sql(`DROP TABLE IF EXISTS notifications;`);
  pgm.sql(`DROP TABLE IF EXISTS follows;`);
  pgm.sql(`DROP TABLE IF EXISTS territory_captures;`);
  pgm.sql(`DROP TABLE IF EXISTS territories;`);
  pgm.sql(`DROP TABLE IF EXISTS run_points;`);
  pgm.sql(`DROP TABLE IF EXISTS runs;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
  
  // Optional: Do not drop pgcrypto as it might be used by other databases/schemas on the server,
  // but for completeness of a full teardown:
  pgm.sql(`DROP EXTENSION IF EXISTS "pgcrypto";`);
}
