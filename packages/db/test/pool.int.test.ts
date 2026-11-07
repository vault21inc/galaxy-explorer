import { afterEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createPool, pingDatabase } from '../src/pool.ts';
import { requireEnv } from './env.ts';

describe('pingDatabase', () => {
  const pools: pg.Pool[] = [];
  const open = (url: string) => {
    const pool = createPool(url, () => undefined);
    pools.push(pool);
    return pool;
  };

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it('is true for the test database', async () => {
    expect(await pingDatabase(open(requireEnv('TEST_DATABASE_URL')))).toBe(true);
  });

  it('is false when nothing listens on the port', async () => {
    expect(await pingDatabase(open('postgres://ge:ge@127.0.0.1:1/ge'))).toBe(false);
  });
});
