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
    ...overrides,
  };
}

/** Reads an environment variable that integration tests can't run without. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and run \`pnpm db:up\`.`);
  }
  return value;
}
