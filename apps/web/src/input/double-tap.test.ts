import { describe, expect, it } from 'vitest';
import { isDoubleTap, type Tap } from './double-tap.ts';

const limits = { ms: 300, slopPx: 24 };
const first: Tap = { timeMs: 1_000, x: 100, y: 100, id: 'aster' };
const second = (change: Partial<Tap>): Tap => ({ ...first, timeMs: 1_200, ...change });

describe('a double-tap', () => {
  it('is two taps on the same object, close in time and place', () => {
    expect(isDoubleTap(first, second({}), limits)).toBe(true);
    expect(isDoubleTap(first, second({ x: 115, y: 115 }), limits)).toBe(true);
    expect(isDoubleTap(first, second({ timeMs: 1_300 }), limits)).toBe(true);
  });

  it('is not one tap too late, or too far away', () => {
    expect(isDoubleTap(first, second({ timeMs: 1_301 }), limits)).toBe(false);
    expect(isDoubleTap(first, second({ x: 125, y: 100 }), limits)).toBe(false);
  });

  it('is not two taps on different objects, or on empty space, or a first tap', () => {
    expect(isDoubleTap(first, second({ id: 'gudrun' }), limits)).toBe(false);
    expect(isDoubleTap({ ...first, id: null }, second({ id: null }), limits)).toBe(false);
    expect(isDoubleTap(null, second({}), limits)).toBe(false);
  });

  it('ignores a clock that went backwards', () => {
    expect(isDoubleTap(first, second({ timeMs: 900 }), limits)).toBe(false);
  });
});
