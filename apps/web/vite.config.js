import { resolve } from 'node:path';
import { WEB_APP_HEADERS } from '@ge/domain/security';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  // The API's port comes from the same .env the API reads (GE_PORT, default 3100).
  const env = loadEnv(mode, repoRoot, 'GE_');
  const apiOrigin = `http://127.0.0.1:${env.GE_PORT ?? '3100'}`;

  return {
    // VITE_* variables (such as VITE_TEST_HOOKS) come from the repository's .env files.
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: resolve(import.meta.dirname, 'src') },
        // Zod, set up for the Content-Security-Policy before any schema is made (src/zod.ts).
        // Only the bare name: src/zod.ts itself imports 'zod/v4'.
        { find: /^zod$/, replacement: resolve(import.meta.dirname, 'src/zod.ts') },
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      // The browser talks only to the Vite server, which forwards these to the API, so there's
      // no cross-origin setup in development.
      proxy: { '/api': apiOrigin, '/media': apiOrigin },
    },
    // `vite preview` serves the production build with the production site's security headers
    // (M8-T3), Content-Security-Policy included, so the e2e tests would catch anything the
    // policy blocks. The API's responses, proxied, keep their own. The dev server sends none:
    // its hot reloading runs inline scripts.
    preview: { headers: WEB_APP_HEADERS },
    // Web Workers (src/workers/) are built as ES modules, like the app, so they can share its
    // code (the domain package) and `new Worker(…, { type: 'module' })` works in every browser.
    worker: { format: 'es' },
    // Vitest runs only the unit tests; e2e/*.spec.ts are Playwright's.
    test: { include: ['{src,test}/**/*.test.{ts,tsx}'] },
    build: {
      sourcemap: true,
      // three.js alone is about 700 kB minified, so Vite's default 500 kB warning always fires.
      // The real budget is 600 kB of initial JavaScript after gzip (rendering.md §2).
      chunkSizeWarningLimit: 2_000,
    },
  };
});
