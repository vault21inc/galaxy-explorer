import type { Config } from '../src/config.ts';

/** A port where nothing listens: the pool connects lazily, so unit tests never touch it. */
export const UNREACHABLE_DATABASE_URL = 'postgres://ge:ge@127.0.0.1:1/ge';

/** Server config for tests: quiet logs, and a database that unit tests never reach. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: UNREACHABLE_DATABASE_URL,
    authMode: 'none',
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    previewRoles: false,
    wikiUserAgent: 'GalaxyExplorer/test',
    // No wiki unless a test sets up its own fixture server (M7-T3).
    wikiSources: [],
    // Tests that upload pass their own temporary directory.
    mediaDir: '/nonexistent/ge-media',
    ...overrides,
  };
}
