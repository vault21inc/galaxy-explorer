import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * Shared Vitest config for packages that have integration tests. Re-export it from the
 * package's vitest.config.js. It defines two projects:
 *
 * - `unit` (`pnpm test`): `*.test.ts` files, no database or network.
 * - `integration` (`pnpm test:integration`): `*.int.test.ts` files, run against the test
 *   Postgres. They read TEST_DATABASE_URL from the environment, or from the repository's
 *   .env file when it exists.
 */
export default defineConfig({
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
        },
      },
    ],
  },
});
