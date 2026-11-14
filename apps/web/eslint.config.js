import { configFor } from '@ge/config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(configFor('@ge/web', import.meta.dirname, { react: true }), {
  // e2e/test.ts adds the Content-Security-Policy guard to every test (M8-T3).
  files: ['e2e/**/*.spec.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "ImportDeclaration[source.value='@playwright/test'] ImportSpecifier[imported.name='test']",
        message: "Import `test` from './test.ts', which checks the page's CSP violations.",
      },
    ],
  },
});
