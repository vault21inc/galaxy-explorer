import { describe, expect, it } from 'vitest';
import { createDatabase, pingDatabase } from '../src/client.ts';
import { withTestDb } from '../src/testing/index.ts';

describe('pingDatabase', () => {
  it('is true for a reachable database', () =>
    withTestDb(async (db) => {
      expect(await pingDatabase(db)).toBe(true);
    }));

  it('is false when nothing listens on the port', async () => {
    const db = createDatabase('postgres://ge:ge@127.0.0.1:1/ge', {
      onIdleClientError: () => undefined,
    });
    try {
      expect(await pingDatabase(db)).toBe(false);
    } finally {
      await db.$client.end();
    }
  });
});
