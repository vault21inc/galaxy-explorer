import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrateDatabase, resetDatabase } from '../src/migrate.ts';
import { withTestDb } from '../src/testing/index.ts';

/** Runs one query on its own connection, so the test database's pool stays unused. */
async function query(url: string, text: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query<Record<string, unknown>>(text);
  } finally {
    await client.end();
  }
}

describe('migrateDatabase', () => {
  it('is a no-op on a database that is already migrated', () =>
    withTestDb(async (_db, url) => {
      await migrateDatabase(url);
      await migrateDatabase(url);
    }));
});

describe('resetDatabase', () => {
  it('drops everything and leaves a freshly migrated database', () =>
    withTestDb(async (_db, url) => {
      await query(url, 'create table leftover (id int)');

      await resetDatabase(url);

      const result = await query(
        url,
        `select to_regclass('public.leftover')::text as leftover,
                to_regclass('drizzle.__drizzle_migrations')::text as migrations`,
      );
      expect(result.rows[0]).toEqual({
        leftover: null,
        migrations: 'drizzle.__drizzle_migrations',
      });
    }));
});
