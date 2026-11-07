import { describe, expect, it } from 'vitest';
import { databaseNameOf, isLoopbackUrl, withDatabaseName } from '../src/admin.ts';

describe('connection URL helpers', () => {
  const url = 'postgres://ge:secret@127.0.0.1:5443/ge_test?sslmode=disable';

  it('reads the database name', () => {
    expect(databaseNameOf(url)).toBe('ge_test');
    expect(() => databaseNameOf('postgres://ge@127.0.0.1:5443')).toThrow(/no database name/);
  });

  it('swaps the database name and keeps everything else', () => {
    expect(withDatabaseName(url, 'postgres')).toBe(
      'postgres://ge:secret@127.0.0.1:5443/postgres?sslmode=disable',
    );
  });

  it.each([
    ['postgres://ge@127.0.0.1/ge', true],
    ['postgres://ge@localhost/ge', true],
    ['postgres://ge@[::1]:5442/ge', true],
    ['postgres://ge@db.example.com/ge', false],
    ['postgres://ge@10.0.0.5/ge', false],
  ])('%s is loopback: %s', (connectionString, expected) => {
    expect(isLoopbackUrl(connectionString)).toBe(expected);
  });
});
