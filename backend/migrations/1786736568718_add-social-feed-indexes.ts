import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE INDEX runs_user_id_created_at_idx ON runs(user_id, created_at DESC);`);
  pgm.sql(`CREATE INDEX territory_captures_user_id_captured_at_idx ON territory_captures(user_id, captured_at DESC);`);
  pgm.sql(`CREATE INDEX follows_followee_id_idx ON follows(followee_id);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX follows_followee_id_idx;`);
  pgm.sql(`DROP INDEX territory_captures_user_id_captured_at_idx;`);
  pgm.sql(`DROP INDEX runs_user_id_created_at_idx;`);
}
