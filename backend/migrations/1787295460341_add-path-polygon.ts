import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('runs', {
    path_polygon: { type: 'jsonb', notNull: false },
  });
  
  pgm.addColumns('territories', {
    captured_run_id: {
      type: 'uuid',
      references: '"runs"',
      onDelete: 'SET NULL',
      notNull: false,
    },
  });
  
  pgm.createIndex('territories', 'captured_run_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('territories', 'captured_run_id');
  pgm.dropColumns('territories', ['captured_run_id']);
  pgm.dropColumns('runs', ['path_polygon']);
}
