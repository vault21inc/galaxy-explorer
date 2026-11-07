/**
 * @ge/db/testing: isolated, migrated databases for integration tests (`*.int.test.ts`).
 * Only test code imports this; it depends on Vitest.
 */
export { withTestDb } from './with-test-db.ts';
