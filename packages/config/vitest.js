import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * Shared Vitest config for packages that have integration tests. Use it as the package's
 * vitest.config.js: `export default vitestConfig();`. It defines two projects:
 *
 * - `unit` (`pnpm test`): `*.test.ts` files, no database or network.
 * - `integration` (`pnpm test:integration`): `*.int.test.ts` files, run against the test
 *   Postgres. They read TEST_DATABASE_URL from the environment, or from the repository's
 *   .env file when it exists.
 *
 * @param {object} [options]
 * @param {string} [options.integrationGlobalSetup] Path to a global setup for the integration
 *   project. Packages whose tests call `withTestDb` pass @ge/db's
 *   (`@ge/db/testing/global-setup`), which builds the migrated template database. This package
 *   can't import @ge/db itself (layering), so each package resolves the path.
 */
export function vitestConfig({ integrationGlobalSetup } = {}) {
  return defineConfig({
    test: {
      projects: [
        {
          test: {
            name: 'unit',
            include: ['{src,test}/**/*.test.ts'],
            exclude: ['**/*.int.test.ts'],
          },
        },
        {
          test: {
            name: 'integration',
            include: ['{src,test}/**/*.int.test.ts'],
            env: loadEnv('test', repoRoot, ''),
            globalSetup: integrationGlobalSetup ? [integrationGlobalSetup] : [],
          },
        },
      ],
    },
  });
}
