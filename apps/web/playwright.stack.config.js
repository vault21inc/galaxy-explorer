import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * The e2e tests against the production stack (M8-T4): docker/compose.prod.yml running on this
 * machine, behind Caddy, with accounts. It's started apart, with the test hooks built in:
 *
 *   docker compose -f docker/compose.prod.yml --env-file <env file> up -d --build --wait
 *
 * with VITE_TEST_HOOKS=1 and GE_SITE_ADDRESS=127.0.0.1 in the env file
 * (docs/ops/production.md). Then, from apps/web:
 *
 *   GE_STACK_ENV_FILE=<env file> pnpm exec playwright test -c playwright.stack.config.js
 *
 * The setup makes an account through an invite link from the API's container and signs in;
 * the tests run as that account. Nothing else is started or reset: the stack is left as it is.
 */
const STACK_URL = process.env.GE_STACK_URL ?? 'https://127.0.0.1:8443';
// The account helpers (e2e/accounts.ts) talk to the site with accounts: here, the stack.
process.env.GE_E2E_AUTH_URL = STACK_URL;
process.env.GE_E2E_MCP_URL = `${STACK_URL}/mcp`;
process.env.GE_STACK_SESSION = resolve(import.meta.dirname, 'test-results/stack-session.json');

export default defineConfig({
  testDir: './e2e',
  testMatch: ['golden-path.spec.ts', 'stack.spec.ts'],
  globalSetup: './e2e/stack-setup.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: STACK_URL,
    // Caddy's own authority signs a local stack's certificate.
    ignoreHTTPSErrors: true,
    storageState: process.env.GE_STACK_SESSION,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
