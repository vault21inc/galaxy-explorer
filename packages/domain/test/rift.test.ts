import { describe, expect, it } from 'vitest';
import {
  catmullRom,
  defaultRiftPath,
  distanceToPolyline,
  pointsAlong,
  polylineLength,
} from '../src/geo/rift.ts';

/** A rift's curve and sampling (M4-T6). */

describe('catmullRom', () => {
  it('passes through every point, with steps in between', () => {
    const points = [
      [0, 0],
      [1_000, 500],
      [2_000, 0],
      [3_000, 500],
    ] as const;
    const curve = catmullRom(points, 8);
    expect(curve).toHaveLength(1 + 3 * 8);
    for (const [index, point] of points.entries()) {
      const onCurve = curve[index * 8];
      expect(onCurve?.[0]).toBeCloseTo(point[0]);
      expect(onCurve?.[1]).toBeCloseTo(point[1]);
    }
  });

  it('is a straight line through two points', () => {
    const curve = catmullRom(
      [
        [0, 0],
        [100, 0],
      ],
      4,
    );
    expect(curve.map(([, z]) => z)).toEqual([0, 0, 0, 0, 0]);
    // On the line and in order (it eases in and out, so the steps aren't evenly spaced).
    const xs = curve.map(([x]) => x);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(100);
    expect(xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? 0))).toBe(true);
  });
});

describe('pointsAlong', () => {
  it('spreads points evenly by length, end to end', () => {
    const elbow = [
      [0, 0],
      [100, 0],
      [100, 300],
    ] as const;
    expect(polylineLength(elbow)).toBe(400);
    const along = pointsAlong(elbow, 5);
    expect(along.map(({ point }) => point)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
      [100, 200],
      [100, 300],
    ]);
    expect(along[0]?.tangent).toEqual([1, 0]);
    expect(along[3]?.tangent).toEqual([0, 1]);
  });
});

describe('distanceToPolyline', () => {
  it('measures to the nearest segment', () => {
    const line = [
      [0, 0],
      [100, 0],
    ] as const;
    expect(distanceToPolyline([50, 30], line)).toBe(30);
    expect(distanceToPolyline([130, 40], line)).toBe(50);
  });
});

describe('defaultRiftPath', () => {
  it('is a straight band eight half-widths long', () => {
    expect(polylineLength(defaultRiftPath(500))).toBe(4_000);
  });
});
