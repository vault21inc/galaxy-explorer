import pg from 'pg';

/**
 * Server-level helpers: creating and dropping whole databases. Postgres can't run
 * `create database` or `drop database` from inside the database being changed, so these
 * connect to the `postgres` maintenance database on the same server.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

/** The database name in a connection URL, such as `ge` in `postgres://…/ge`. */
export function databaseNameOf(connectionString: string): string {
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!name) {
    throw new Error('The connection URL has no database name.');
  }
  return name;
}

/** The same connection URL pointing at another database on the same server. */
export function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
}

/** True when the URL points at this machine, which is where destructive dev tools may run. */
export function isLoopbackUrl(connectionString: string): boolean {
  return LOOPBACK_HOSTS.has(new URL(connectionString).hostname);
}

/** Runs `fn` with a client connected to the server's `postgres` maintenance database. */
export async function withAdminClient<T>(
  connectionString: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    connectionString: withDatabaseName(connectionString, 'postgres'),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates an empty database, or a copy of `template` when given. Copying a template is how
 * test databases start out already migrated, in milliseconds.
 */
export async function createDatabaseNamed(
  client: pg.Client,
  databaseName: string,
  template?: string,
): Promise<void> {
  const from = template ? ` template ${pg.escapeIdentifier(template)}` : '';
  await client.query(`create database ${pg.escapeIdentifier(databaseName)}${from}`);
}

/** Drops a database if it exists, disconnecting anyone still connected to it. */
export async function dropDatabaseNamed(client: pg.Client, databaseName: string): Promise<void> {
  await client.query(`drop database if exists ${pg.escapeIdentifier(databaseName)} with (force)`);
}

/** Every database on the server whose name starts with `prefix`. */
export async function listDatabases(client: pg.Client, prefix: string): Promise<string[]> {
  const result = await client.query<{ datname: string }>(
    `select datname from pg_database where starts_with(datname, $1) order by datname`,
    [prefix],
  );
  return result.rows.map((row) => row.datname);
}
