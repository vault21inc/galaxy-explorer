import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

/**
 * Global setup for the client's integration tests: starts the real API as a separate process,
 * on its own database, and tells the tests where it is. The client package may not import the
 * API or the database (architecture.md §2), so it runs them by command, as Playwright does.
 */

declare module 'vitest' {
  interface ProvidedContext {
    apiBaseUrl?: string;
  }
}

const repoRoot = resolve(import.meta.dirname, '../../..');
/** Away from `pnpm dev` (3100) and the e2e tests (3101). */
const PORT = '3102';

export default async function setup(project: TestProject): Promise<() => void> {
  const testServer = process.env.TEST_DATABASE_URL ?? project.config.env.TEST_DATABASE_URL;
  if (!testServer)
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:up`.',
    );
  const databaseUrl = new URL(testServer);
  databaseUrl.pathname = '/ge_client_test';
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    GE_PORT: PORT,
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
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline || server.exitCode !== null) {
      server.kill();
      throw new Error('The API did not start for the client tests.');
    }
    await new Promise((settle) => setTimeout(settle, 100));
  }

  project.provide('apiBaseUrl', baseUrl);
  return () => {
    server.kill();
  };
}
