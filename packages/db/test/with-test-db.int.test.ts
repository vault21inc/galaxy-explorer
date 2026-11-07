import { sql } from 'drizzle-orm';
import { describe, expect, inject, it } from 'vitest';
import { listDatabases, withAdminClient } from '../src/admin.ts';
import { TEST_DATABASE_PREFIX } from '../src/testing/context.ts';
import { withTestDb } from '../src/testing/index.ts';

/** The name of the database `db` is connected to. */
async function currentDatabase(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  const result = await db.execute<{ name: string }>(sql`select current_database() as name`);
  return result.rows[0]?.name;
}

async function databaseExists(name: string) {
  const { serverUrl } = inject('geTestDatabase') ?? { serverUrl: '' };
  const names = await withAdminClient(serverUrl, (client) =>
    listDatabases(client, TEST_DATABASE_PREFIX),
  );
  return names.includes(name);
}

describe('withTestDb', () => {
  it('gives a migrated database of its own and drops it afterwards', async () => {
    const name = await withTestDb(async (db) => {
      // Drizzle's bookkeeping table exists only once migrations have run.
      const migrations = await db.execute<{ table: string | null }>(
        sql`select to_regclass('drizzle.__drizzle_migrations')::text as table`,
      );
      expect(migrations.rows[0]?.table).toBe('drizzle.__drizzle_migrations');
      return currentDatabase(db);
    });

    expect(name?.startsWith(TEST_DATABASE_PREFIX)).toBe(true);
    expect(await databaseExists(name ?? '')).toBe(false);
  });

  it('keeps tests apart: a table made in one database is absent in the next', async () => {
    await withTestDb((db) => db.execute(sql`create table scratch (id int)`));

    await withTestDb(async (db) => {
      const result = await db.execute<{ table: string | null }>(
        sql`select to_regclass('public.scratch')::text as table`,
      );
      expect(result.rows[0]?.table).toBeNull();
    });
  });

  it('drops the database even when the test fails', async () => {
    let name: string | undefined;
    await expect(
      withTestDb(async (db) => {
        name = await currentDatabase(db);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(name).toBeDefined();
    expect(await databaseExists(name ?? '')).toBe(false);
  });
});
