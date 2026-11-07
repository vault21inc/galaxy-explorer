import { inject } from 'vitest';
import {
  createDatabaseNamed,
  dropDatabaseNamed,
  withAdminClient,
  withDatabaseName,
} from '../admin.ts';
import { createDatabase, type Database } from '../client.ts';
import './context.ts';
import { newTestDatabaseName } from './template.ts';

/**
 * Runs `fn` against a fresh, fully migrated database of its own, then drops it.
 *
 * The database is a copy of the template the global setup migrated, so creating one takes
 * milliseconds and tests never see each other's rows. `fn` also gets the database's URL, for
 * code that opens its own connections, such as the API server.
 *
 * ```ts
 * it('stores a universe', () =>
 *   withTestDb(async (db) => {
 *     …
 *   }));
 * ```
 */
export async function withTestDb<T>(fn: (db: Database, url: string) => Promise<T>): Promise<T> {
  const { serverUrl, templateName } = testDatabaseContext();
  const databaseName = newTestDatabaseName();
  const url = withDatabaseName(serverUrl, databaseName);

  await withAdminClient(serverUrl, (client) =>
    createDatabaseNamed(client, databaseName, templateName),
  );
  const db = createDatabase(url, {
    onIdleClientError: (error) => {
      console.error(`Test database ${databaseName}: idle connection failed`, error);
    },
  });
  try {
    return await fn(db, url);
  } finally {
    await db.$client.end();
    await withAdminClient(serverUrl, (client) => dropDatabaseNamed(client, databaseName));
  }
}

function testDatabaseContext() {
  const context = inject('geTestDatabase');
  if (!context) {
    throw new Error(
      'withTestDb needs the test database setup: pass `integrationGlobalSetup` to ' +
        'vitestConfig() in this package’s vitest.config.js (see @ge/config/vitest).',
    );
  }
  return context;
}
