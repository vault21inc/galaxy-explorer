import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * Starts the real API as a separate process, on a fresh database of its own, for the
 * integration tests of packages that may not import the API or the database
 * (architecture.md §2): the API client (M1-T10) and the MCP server (M7-T7). They run it by
 * command, as Playwright does. Used from a Vitest global setup.
 *
 * @param {object} options
 * @param {string | undefined} options.testServerUrl TEST_DATABASE_URL: the test Postgres.
 * @param {string} options.databaseName The run's own database, reset each time.
 * @param {string} options.port Away from `pnpm dev` (3100), e2e (3101) and the other suites.
 * @returns {Promise<{ apiUrl: string, databaseUrl: string, stop: () => void }>}
 */
export async function startTestApi({ testServerUrl, databaseName, port }) {
  if (!testServerUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:up`.',
    );
  }
  const databaseUrl = new URL(testServerUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    GE_PORT: port,
    GE_LOG_LEVEL: 'warn',
  };

  // A fresh, migrated database for this run.
  execFileSync('node', ['src/cli.ts', 'reset'], {
    cwd: resolve(repoRoot, 'packages/db'),
    env,
    stdio: 'pipe',
  });

  const server = spawn('node', ['src/main.ts'], {
    cwd: resolve(repoRoot, 'apps/api'),
    env,
    stdio: 'inherit',
  });
  const apiUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      if ((await fetch(`${apiUrl}/api/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline || server.exitCode !== null) {
      server.kill();
      throw new Error(`The API did not start on port ${port}.`);
    }
    await new Promise((settle) => setTimeout(settle, 100));
  }
  return {
    apiUrl,
    databaseUrl: databaseUrl.toString(),
    stop: () => {
      server.kill();
    },
  };
}
