import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// The activity feed shows "claimed N cells" for each run, which counts
// territory_captures by run_id. Without this index that count is a full scan per run.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE INDEX territory_captures_run_id_idx ON territory_captures(run_id);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX territory_captures_run_id_idx;`);
}
