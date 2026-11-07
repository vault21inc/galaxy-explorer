/**
 * @ge/db: the PostgreSQL schema and data primitives.
 *
 * The schema, audit trigger, batches and revert arrive in M1 (docs/plan/data-model.md).
 * Test databases come from `@ge/db/testing`.
 */
export { createDatabase, pingDatabase, type Database, type DatabaseOptions } from './client.ts';
export { MIGRATIONS_DIR, migrateDatabase, resetDatabase } from './migrate.ts';
