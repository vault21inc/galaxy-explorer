import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test/layers.test.js runs real ESLint. Its first lint loads typescript-eslint and the
    // React plugins, which takes several seconds on a cold CI runner: more than Vitest's
    // default 5 s per test.
    testTimeout: 30_000,
  },
});
