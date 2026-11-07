import { sql } from 'drizzle-orm';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema/index.ts';

/** How long to wait for a connection before failing, so a down database fails fast. */
const CONNECT_TIMEOUT_MS = 2_000;

export interface DatabaseOptions {
  /**
   * Called when an idle pooled connection fails, for example when Postgres restarts. Without
   * a listener, `pg` would crash the process on that error.
   */
  onIdleClientError: (error: Error) => void;
  /** The most connections the pool opens at once; `pg` defaults to 10. */
  maxConnections?: number;
}

/**
 * Opens a connection pool and wraps it in Drizzle. Connections open lazily, on the first query.
 * Close it with `db.$client.end()`.
 *
 * `casing: 'snake_case'` maps camelCase names in the schema and in query results to
 * snake_case in the database (architecture.md §5).
 */
export function createDatabase(connectionString: string, options: DatabaseOptions) {
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    max: options.maxConnections,
  });
  pool.on('error', options.onIdleClientError);
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

/** A Drizzle database over a `pg` pool, as returned by `createDatabase`. */
export type Database = ReturnType<typeof createDatabase>;

/**
 * Anything queries can run on: the database itself, or a transaction inside `withBatch`.
 * Services take an Executor so the same code runs alone or as part of a larger batch.
 */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/** True when the database answers a trivial query; never throws. */
export async function pingDatabase(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
