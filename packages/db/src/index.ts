/**
 * @ge/db: the PostgreSQL schema and data primitives.
 *
 * Every write runs inside `withBatch()`; see src/audit/ and data-model.md §9.
 * Test databases come from `@ge/db/testing`.
 */
export { createDatabase, pingDatabase, type Database, type DatabaseOptions } from './client.ts';
export { MIGRATIONS_DIR, migrateDatabase, resetDatabase } from './migrate.ts';
export * from './audit/index.ts';
export * as schema from './schema/index.ts';
