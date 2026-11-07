import pg from 'pg';
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
export async function withTestDb<T>(
  fn: (db: Database, url: string) => Promise<T>,
  options: TestDbOptions = {},
): Promise<T> {
  const { serverUrl, templateName } = testDatabaseContext();
  const databaseName = newTestDatabaseName();
  let url = withDatabaseName(serverUrl, databaseName);

  await withAdminClient(serverUrl, (client) =>
    createDatabaseNamed(client, databaseName, templateName),
  );
  if (options.ambientBatch) url = await withAmbientBatch(url);
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

export interface TestDbOptions {
  /**
   * Log every write to one change batch made up front, so tests about constraints rather than
   * history can write without `withBatch` (which they'd otherwise need: the audit trigger
   * rejects writes outside a batch with GE400). Tests of history itself leave this off.
   */
  ambientBatch?: boolean;
}

/**
 * Creates a batch and returns a URL whose connections all start with `ge.batch_id` set to it,
 * through Postgres's `options` connection parameter. `withBatch` still overrides it inside its
 * own transactions.
 */
async function withAmbientBatch(url: string): Promise<string> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      `insert into change_batches (actor_type, actor_label, description)
       values ('system', 'test', 'Ambient test batch') returning id`,
    );
    const batchId = result.rows[0]?.id;
    if (!batchId) throw new Error('Creating the ambient batch returned no row.');
    const withOptions = new URL(url);
    withOptions.searchParams.set('options', `-c ge.batch_id=${batchId}`);
    return withOptions.toString();
  } finally {
    await client.end();
  }
}
