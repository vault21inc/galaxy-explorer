import { describe, expect, it } from 'vitest';
import { resetDatabase } from '../src/migrate.ts';

describe('resetDatabase', () => {
  it('refuses a database that is not on this machine, before connecting', async () => {
    await expect(resetDatabase('postgres://ge@db.example.com:5432/ge')).rejects.toThrow(
      /only runs against a database on this machine/,
    );
  });
});
