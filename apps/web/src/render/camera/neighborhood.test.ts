import { describe, expect, it } from 'vitest';
import { distanceToFit, neighborhoodRadius } from './neighborhood.ts';

const rules = { count: 3, minCount: 3, gap: 4, padding: 1.25, maxRadius: 1_500 };
const at = (x: number): [number, number, number] => [x, 0, 0];

describe('neighborhoodRadius', () => {
  it('reaches the count-th nearest neighbor, padded, whatever their order', () => {
    expect(neighborhoodRadius(at(0), [at(40), at(4), at(-8), at(12), at(900)], rules)).toBe(15);
  });

  it('measures in three dimensions', () => {
    expect(neighborhoodRadius([1, 1, 1], [[1, 4, 5]], { ...rules, count: 1 })).toBe(6.25);
  });

  it('reaches the farthest when there are fewer neighbors than the count', () => {
    expect(neighborhoodRadius(at(0), [at(4), at(-8)], rules)).toBe(10);
  });

  it('stops at a gap once it has a few neighbors, but not before', () => {
    const cluster = [at(4), at(6), at(9), at(12), at(20_000), at(21_000)];
    const eight = { ...rules, count: 8 };
    expect(neighborhoodRadius(at(0), cluster, eight)).toBe(15);
    // The first three are in whatever the gaps between them.
    expect(neighborhoodRadius(at(0), [at(1), at(40), at(400)], eight)).toBe(500);
    // Without a gap it counts on to the eighth.
    const even = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => at(x * 10));
    expect(neighborhoodRadius(at(0), even, eight)).toBe(100);
  });

  it('is the widest allowed for a lone object, and never wider', () => {
    expect(neighborhoodRadius(at(0), [], rules)).toBe(1_500);
    expect(neighborhoodRadius(at(0), [at(4), at(8), at(30_000)], rules)).toBe(1_500);
  });
});

describe('distanceToFit', () => {
  it('stands back by radius / sin(half the field of view)', () => {
    // 60° up and down: sin(30°) is a half, so twice the radius.
    expect(distanceToFit(10, 60, 16 / 9)).toBeCloseTo(20);
  });

  it('fits the narrower way in an upright window', () => {
    const upright = distanceToFit(10, 45, 9 / 16);
    expect(upright).toBeGreaterThan(distanceToFit(10, 45, 16 / 9));
    // tan(h / 2) = tan(22.5°) × 9/16.
    const half = Math.atan(Math.tan(Math.PI / 8) * (9 / 16));
    expect(upright).toBeCloseTo(10 / Math.sin(half));
  });
});
