import { describe, expect, it } from 'vitest';
import { TEST_DATABASE_PREFIX } from '../src/testing/context.ts';
import { newTestDatabaseName, testDatabaseCreatedMs } from '../src/testing/template.ts';

describe('test database names', () => {
  it('record when they were created, to the second', () => {
    const createdMs = Date.UTC(2026, 10, 7, 12, 30, 15);
    const name = newTestDatabaseName(createdMs);

    expect(name.startsWith(TEST_DATABASE_PREFIX)).toBe(true);
    expect(name).toMatch(/^[a-z0-9_]+$/);
    expect(testDatabaseCreatedMs(name)).toBe(createdMs);
  });

  it('are unique', () => {
    const names = new Set(Array.from({ length: 100 }, () => newTestDatabaseName()));
    expect(names.size).toBe(100);
  });

  it('yield no creation time when the name has none', () => {
    expect(testDatabaseCreatedMs(TEST_DATABASE_PREFIX)).toBeUndefined();
  });
});
