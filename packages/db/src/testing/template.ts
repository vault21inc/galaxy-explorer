import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import {
  createDatabaseNamed,
  dropDatabaseNamed,
  listDatabases,
  withAdminClient,
  withDatabaseName,
} from '../admin.ts';
import { MIGRATIONS_DIR, migrateDatabase } from '../migrate.ts';
import { TEMPLATE_PREFIX, TEST_DATABASE_PREFIX } from './context.ts';

/** Any fixed number: the advisory lock that serializes template builds across processes. */
const TEMPLATE_LOCK_KEY = 0x6765_7465;

/** Test databases older than this are left over from a crashed run, and get dropped. */
const STALE_TEST_DATABASE_AGE_MS = 60 * 60 * 1000;

/**
 * Makes sure a migrated template database exists on the test server, and returns its name.
 *
 * The name includes a hash of the migrations folder, so:
 * - a template is reused across runs until a migration changes, which skips migrating;
 * - db and api tests, which Turborepo runs at the same time, share it safely.
 *
 * An advisory lock makes concurrent runs wait for one another while building. The template is
 * built under a temporary name and renamed when complete, so a crash never leaves a
 * half-migrated template behind.
 */
export async function ensureTemplateDatabase(serverUrl: string): Promise<string> {
  const templateName = `${TEMPLATE_PREFIX}${await hashMigrations()}`;
  const buildingName = `${templateName}_building`;

  await withAdminClient(serverUrl, async (client) => {
    await client.query('select pg_advisory_lock($1)', [TEMPLATE_LOCK_KEY]);
    try {
      const existing = await listDatabases(client, TEMPLATE_PREFIX);
      if (!existing.includes(templateName)) {
        await dropDatabaseNamed(client, buildingName);
        await createDatabaseNamed(client, buildingName);
        await migrateDatabase(withDatabaseName(serverUrl, buildingName));
        await client.query(
          `alter database ${pg.escapeIdentifier(buildingName)} rename to ${pg.escapeIdentifier(templateName)}`,
        );
      }
      await dropStaleDatabases(client, templateName);
    } finally {
      await client.query('select pg_advisory_unlock($1)', [TEMPLATE_LOCK_KEY]);
    }
  });
  return templateName;
}

/** A short hash of every file in the migrations folder, names and contents. */
async function hashMigrations(): Promise<string> {
  const files = (await readdir(MIGRATIONS_DIR, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.slice(MIGRATIONS_DIR.length));
    hash.update(await readFile(file));
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * Drops templates for older migrations, and test databases a crashed run left behind. A
 * template still being copied can't be dropped; it's skipped and tried again next run.
 */
async function dropStaleDatabases(client: pg.Client, currentTemplate: string): Promise<void> {
  const oldTemplates = (await listDatabases(client, TEMPLATE_PREFIX)).filter(
    (name) => name !== currentTemplate,
  );
  for (const name of oldTemplates) {
    // Without `with (force)`, this fails instead of disconnecting a run that's still copying.
    await client
      .query(`drop database if exists ${pg.escapeIdentifier(name)}`)
      .catch(() => undefined);
  }

  const now = Date.now();
  for (const name of await listDatabases(client, TEST_DATABASE_PREFIX)) {
    const createdMs = testDatabaseCreatedMs(name);
    if (createdMs !== undefined && now - createdMs > STALE_TEST_DATABASE_AGE_MS) {
      await dropDatabaseNamed(client, name);
    }
  }
}

/** Builds a test database name that records when it was created. */
export function newTestDatabaseName(nowMs = Date.now()): string {
  const created = Math.floor(nowMs / 1000).toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${TEST_DATABASE_PREFIX}${created}_${random}`;
}

/** When a test database was created, read back from its name. */
export function testDatabaseCreatedMs(name: string): number | undefined {
  const created = name.slice(TEST_DATABASE_PREFIX.length).split('_')[0];
  const seconds = created ? parseInt(created, 36) : NaN;
  return Number.isNaN(seconds) ? undefined : seconds * 1000;
}
