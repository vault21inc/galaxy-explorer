/**
 * Every package in the monorepo, and what each one must never import.
 *
 * This is the layering table in docs/plan/architecture.md §2, as data. eslint.js turns each
 * row into `no-restricted-imports` rules, and test/layers.test.js checks every row. A `*` at
 * the end covers a whole scope or prefix, such as `@react-three/*` or `node:*`.
 *
 * @type {readonly { name: string, dir: string, mustNotImport: readonly string[] }[]}
 */
export const WORKSPACE_PACKAGES = [
  {
    name: '@ge/domain',
    dir: 'packages/domain',
    // Pure TypeScript shared by the browser and the server: no database, UI, 3D or Node APIs.
    mustNotImport: [
      '@ge/db',
      '@ge/api',
      '@ge/web',
      '@ge/api-client',
      '@ge/mcp',
      'react',
      'react-dom',
      'three',
      '@react-three/*',
      'node:*',
    ],
  },
  {
    name: '@ge/db',
    dir: 'packages/db',
    mustNotImport: ['@ge/api', '@ge/web', '@ge/api-client', '@ge/mcp'],
  },
  {
    name: '@ge/api-client',
    dir: 'packages/api-client',
    // Generated code only: it must not depend on any other workspace package.
    mustNotImport: ['@ge/domain', '@ge/db', '@ge/api', '@ge/web', '@ge/mcp'],
  },
  {
    name: '@ge/config',
    dir: 'packages/config',
    mustNotImport: ['@ge/*'],
  },
  {
    name: '@ge/api',
    dir: 'apps/api',
    mustNotImport: ['@ge/web', '@ge/api-client', '@ge/mcp'],
  },
  {
    name: '@ge/web',
    dir: 'apps/web',
    mustNotImport: ['@ge/db', '@ge/api', '@ge/mcp'],
  },
  {
    name: '@ge/mcp',
    dir: 'apps/mcp',
    mustNotImport: ['@ge/db', '@ge/api', '@ge/web'],
  },
  {
    name: '@ge/perf',
    dir: 'scripts/perf',
    // `pnpm perf` drives the built app in a browser, like a reader: no workspace code.
    mustNotImport: ['@ge/domain', '@ge/db', '@ge/api', '@ge/api-client', '@ge/web', '@ge/mcp'],
  },
  {
    name: '@ge/content',
    dir: 'scripts/content',
    // Builds universes as an outside agent would: over HTTP, through the API and the MCP server,
    // with the domain's pure helpers. Never the database or the apps' code.
    mustNotImport: ['@ge/db', '@ge/api', '@ge/web', '@ge/mcp'],
  },
];
