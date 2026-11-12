import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// The map asks "which owned cells are inside this viewport?" as a lat/lng range query.
// A B-tree on (center_lat, center_lng) narrows by latitude, then filters longitude in the index.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE INDEX territories_center_idx ON territories(center_lat, center_lng);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX territories_center_idx;`);
}
