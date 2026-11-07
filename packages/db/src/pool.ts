import pg from 'pg';

/** How long to wait for a connection before treating the database as unreachable. */
const CONNECT_TIMEOUT_MS = 2_000;

/**
 * Creates a PostgreSQL connection pool. Nothing connects until the first query.
 *
 * @param connectionString - e.g. `postgres://ge:ge@127.0.0.1:5442/ge`
 * @param onIdleClientError - called when an idle pooled connection fails (for example, the
 *   database restarts). Without a listener, Node would crash on the pool's `error` event.
 */
export function createPool(
  connectionString: string,
  onIdleClientError: (error: Error) => void,
): pg.Pool {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  pool.on('error', onIdleClientError);
  return pool;
}

/** True when the database answers a trivial query; false when it can't be reached. */
export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
