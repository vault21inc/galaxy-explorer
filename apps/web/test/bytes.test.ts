import { describe, expect, it } from 'vitest';
import { formatBytes } from '../src/lib/bytes.ts';

describe('formatBytes (M8-T13)', () => {
  it('says sizes in powers of 1,024', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3.4 * 1024 ** 2)).toBe('3.4 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });
});
