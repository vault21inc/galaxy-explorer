import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.ts';

const DATABASE_URL = 'postgres://ge:ge@127.0.0.1:5442/ge';

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      databaseUrl: DATABASE_URL,
      authMode: 'none',
      host: '127.0.0.1',
      port: 3100,
      logLevel: 'info',
      // Relative to the repository root, wherever the API is started from.
      mediaDir: fileURLToPath(new URL('../../../.data/media', import.meta.url)),
    });
  });

  it('keeps an absolute media directory as it is', () => {
    expect(loadConfig({ DATABASE_URL, GE_MEDIA_DIR: '/srv/media' }).mediaDir).toBe('/srv/media');
  });

  it('reads the port as a number', () => {
    expect(loadConfig({ DATABASE_URL, GE_PORT: '4100' }).port).toBe(4100);
  });

  it('rejects a missing database URL with a readable message', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-Postgres database URL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://localhost/ge' })).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ DATABASE_URL, GE_PORT: '70000' })).toThrow(/GE_PORT/);
  });

  it('refuses to listen beyond this machine without login', () => {
    expect(() => loadConfig({ DATABASE_URL, GE_HOST: '0.0.0.0' })).toThrow(/loopback/);
  });

  it('allows any host once login is required', () => {
    const config = loadConfig({ DATABASE_URL, GE_HOST: '0.0.0.0', GE_AUTH_MODE: 'required' });
    expect(config.host).toBe('0.0.0.0');
  });
});
