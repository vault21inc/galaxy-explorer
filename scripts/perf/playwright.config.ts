import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * `pnpm perf` (rendering.md §14): a production build with the test hooks, its own API and
 * database (`ge_perf` on the test server, reset and seeded with the stress map on every run),
 * and the scripted path in a visible Chrome window, then WebKit's.
 *
 * Run it on the reference Mac, with the window on the built-in display (rendering.md §2).
 */
const repoRoot = resolve(import.meta.dirname, '../..');
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch {
  // No .env file: rely on the environment.
}

const API_PORT = '3103';
const WEB_PORT = '4174';
const testServerUrl = process.env.TEST_DATABASE_URL;
if (!testServerUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:up`.');
}
const perfDatabaseUrl = new URL(testServerUrl);
perfDatabaseUrl.pathname = '/ge_perf';

/** A MacBook-sized window at Retina density: what the reference machine renders. */
const window = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: '.',
  testMatch: ['path.spec.ts', 'import.spec.ts'],
  // One browser at a time, nothing else running: the numbers are the point.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // The path takes about 4 minutes per browser since M6-T8 added the orbit view and the look
  // preview; 5 minutes left too little room.
  timeout: 600_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    headless: false,
    ...window,
  },
  projects: [
    // The installed Google Chrome, not Playwright's Chromium build.
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: [
    {
      command: [
        'pnpm --filter @ge/db db:reset',
        // `--closed`: no system opens a view but the busy one prepareSystem makes explorable,
        // so the galaxy phases' wheel can't push into a system (stress.ts).
        'pnpm --filter @ge/api seed stress --closed',
        'pnpm --filter @ge/api start',
      ].join(' && '),
      cwd: repoRoot,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { DATABASE_URL: perfDatabaseUrl.toString(), GE_PORT: API_PORT, GE_LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @ge/web build && pnpm --filter @ge/web preview --port ${WEB_PORT} --strictPort`,
      cwd: repoRoot,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_TEST_HOOKS: '1', GE_PORT: API_PORT },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
