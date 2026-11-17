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
    sessionSecret: undefined,
    publicUrl: undefined,
    trustProxy: undefined,
    homeUniverse: undefined,
    // Tests send far more requests from one address than anyone would; the rate limits'
    // own tests turn them on.
    rateLimits: false,
    wikiUserAgent: 'GalaxyExplorer/test',
    // No wiki unless a test sets up its own fixture server (M7-T3).
    wikiSources: [],
    // Tests that upload pass their own temporary directory.
    mediaDir: '/nonexistent/ge-media',
    ...overrides,
  };
}

/** A multipart body with one `file` field, as a browser's FormData sends it. */
export function multipart(data: Buffer, filename: string, contentType: string) {
  const boundary = `----ge${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
