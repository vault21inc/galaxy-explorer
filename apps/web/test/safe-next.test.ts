import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/safe-next.ts';

describe('safeNext (M8-T1)', () => {
  it('keeps a path on this site, and sends anything else home', () => {
    expect(safeNext('/u/example-universe/main?select=x')).toBe('/u/example-universe/main?select=x');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext('https://evil.example/')).toBe('/');
    expect(safeNext('//evil.example/')).toBe('/');
    expect(safeNext('/\\evil.example/')).toBe('/');
  });
});
