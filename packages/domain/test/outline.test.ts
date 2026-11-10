import { describe, expect, it } from 'vitest';
import {
  areaCentroid,
  chaikin,
  convexHull,
  offsetConvex,
  outlineForGroup,
  type PlanePoint,
} from '../src/geo/outline.ts';
import { seededRandom } from '../src/random.ts';

/** Group outlines (rendering.md §6, M4-T3). */

/** Is the point inside the closed polygon? (Even-odd ray casting.) */
function inside(point: PlanePoint, polygon: readonly PlanePoint[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (
      zi > point[1] !== zj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi
    ) {
      result = !result;
    }
  }
  return result;
}

/** The distance from a point to the polygon's boundary. */
function distanceToEdge(point: PlanePoint, polygon: readonly PlanePoint[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const length2 = dx * dx + dz * dz;
    const t =
      length2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2));
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  return best;
}

function expectEnclosed(points: readonly PlanePoint[], paddingLy: number) {
  const outline = outlineForGroup(points, { paddingLy });
  if (!outline) throw new Error('No outline.');
  for (const point of points) {
    expect(inside(point, outline.points)).toBe(true);
    expect(distanceToEdge(point, outline.points)).toBeGreaterThanOrEqual(paddingLy);
  }
  return outline;
}

describe('convexHull', () => {
  it('keeps the corners, counter-clockwise, and drops what is inside', () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
    ]);
    expect(hull).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
  });

  it('reduces collinear points to the two ends', () => {
    expect(
      convexHull([
        [0, 0],
        [1, 1],
        [3, 3],
        [2, 2],
      ]),
    ).toEqual([
      [0, 0],
      [3, 3],
    ]);
  });

  it('ignores duplicates', () => {
    expect(
      convexHull([
        [1, 1],
        [1, 1],
      ]),
    ).toEqual([[1, 1]]);
  });
});

describe('offsetConvex', () => {
  it('turns one point into a circle and two into a capsule', () => {
    const circle = offsetConvex([[0, 0]], 10);
    expect(circle).toHaveLength(24);
    for (const point of circle) expect(Math.hypot(...point)).toBeCloseTo(10);
    const capsule = offsetConvex(
      [
        [0, 0],
        [100, 0],
      ],
      10,
    );
    // Two half circles of 180°, 12 steps each.
    expect(capsule).toHaveLength(26);
    expect(Math.min(...capsule.map((point) => point[1]))).toBeCloseTo(-10);
    expect(Math.max(...capsule.map((point) => point[0]))).toBeCloseTo(110);
  });
});

describe('chaikin and areaCentroid', () => {
  it('doubles the points and keeps a square centred', () => {
    const square: PlanePoint[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const smoothed = chaikin(square);
    expect(smoothed).toHaveLength(8);
    expect(smoothed[0]).toEqual([1, 0]);
    const [cx, cz] = areaCentroid(smoothed);
    expect(cx).toBeCloseTo(2);
    expect(cz).toBeCloseTo(2);
  });
});

describe('outlineForGroup', () => {
  it('has nothing to outline without points', () => {
    expect(outlineForGroup([], { paddingLy: 100 })).toBeNull();
  });

  it('encloses one, two, collinear and duplicate points by at least the padding', () => {
    expectEnclosed([[500, -200]], 300);
    expectEnclosed(
      [
        [0, 0],
        [4_000, 1_000],
      ],
      300,
    );
    expectEnclosed(
      [
        [0, 0],
        [1_000, 1_000],
        [2_000, 2_000],
      ],
      300,
    );
    expectEnclosed(
      [
        [10, 10],
        [10, 10],
        [10, 10],
      ],
      50,
    );
  });

  it('encloses random clouds by at least the padding, with the centroid inside', () => {
    const random = seededRandom(42);
    for (let trial = 0; trial < 50; trial++) {
      const count = 3 + Math.floor(random() * 40);
      const points = Array.from({ length: count }, (): PlanePoint => [
        (random() - 0.5) * 20_000,
        (random() - 0.5) * 8_000,
      ]);
      const outline = expectEnclosed(points, 200 + random() * 1_500);
      expect(inside(outline.centroid, outline.points)).toBe(true);
    }
  });
});
