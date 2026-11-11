import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = resolve(import.meta.dirname, '../..');
const isCI = Boolean(process.env.CI);

// Read the repository's .env when it exists; variables already set (as in CI) win.
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch {
  // No .env file: rely on the environment.
}

// End-to-end tests get their own ports, so they run alongside `pnpm dev`, and their own
// database on the test server, which they reset at the start of every run.
const API_PORT = '3101';
const WEB_PORT = '4173';
const testServerUrl = process.env.TEST_DATABASE_URL;
if (!testServerUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:up`.');
}
const e2eDatabaseUrl = new URL(testServerUrl);
e2eDatabaseUrl.pathname = '/ge_e2e';

/**
 * Playwright end-to-end tests (`pnpm test:e2e`): real browsers driving the app built with
 * VITE_TEST_HOOKS=1, so tests read 3D state from `window.__GE_TEST__` (rendering.md §14).
 * Locally they run in Chromium and WebKit; CI runs Chromium with software rendering.
 */
export default defineConfig({
  testDir: './e2e',
  // GPU memory over 20 round trips: too slow and timing-sensitive with software rendering.
  // `pnpm perf` checks it on the reference Mac (scripts/perf/system-path.ts).
  testIgnore: isCI ? ['**/leaks.spec.ts'] : [],
  // Read by tests whose numbers depend on the machine's speed (test.info().config.metadata).
  metadata: { softwareRendering: isCI },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // CI machines have no GPU. SwiftShader is Chrome's software WebGL; newer Chrome
          // versions require opting in to it explicitly.
          args: isCI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      // Reset the e2e database and media, seed the demo universe and the 5,000-object stress
      // map, then start the API on it.
      command: [
        'rm -rf ../../.data/e2e-media',
        'pnpm --filter @ge/db db:reset',
        'pnpm --filter @ge/api seed demo',
        'pnpm --filter @ge/api seed stress',
        'pnpm --filter @ge/api start',
      ].join(' && '),
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        DATABASE_URL: e2eDatabaseUrl.toString(),
        GE_PORT: API_PORT,
        GE_LOG_LEVEL: 'warn',
        // Its own media, apart from development's uploads.
        GE_MEDIA_DIR: './.data/e2e-media',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // A production build with the test hooks, served by `vite preview`, which proxies /api
      // to the API above just as the dev server does.
      command: `pnpm build && pnpm preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_TEST_HOOKS: '1', GE_PORT: API_PORT },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
