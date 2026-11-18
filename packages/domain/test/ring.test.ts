import { describe, expect, it } from 'vitest';
import type { PlanePoint } from '../src/geo/outline.ts';
import { ringForGroup, type Ring } from '../src/geo/ring.ts';
import { seededRandom } from '../src/random.ts';
import { GroupStyle } from '../src/schemas/styles.ts';

/** Ring-shaped groups (D-53, rendering.md §6). */

const PADDING = 500;

/** The distance from a point to a closed polyline's nearest edge. */
function distanceToLoop(point: PlanePoint, loop: readonly PlanePoint[]): number {
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const length2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2));
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  return best;
}

const radius = (ring: Ring, point: PlanePoint) =>
  Math.hypot(point[0] - ring.center[0], point[1] - ring.center[1]);

/** Every member is inside the band and at least the padding from both of its lines. */
function expectInBand(ring: Ring, points: readonly PlanePoint[]) {
  for (const point of points) {
    const r = radius(ring, point);
    expect(r).toBeGreaterThan(ring.innerRadiusLy);
    expect(r).toBeLessThan(ring.outerRadiusLy);
    for (const loop of ring.loops) {
      expect(distanceToLoop(point, loop)).toBeGreaterThanOrEqual(PADDING - 1e-6);
    }
  }
}

/** The fill's triangles cover the band's area: an annulus, π(R² − r²), within the chords' error. */
function fillArea(ring: Ring): number {
  const { vertices, triangles } = ring.fill;
  let area = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = [
      vertices[triangles[i]!]!,
      vertices[triangles[i + 1]!]!,
      vertices[triangles[i + 2]!]!,
    ];
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  return area;
}

describe('ringForGroup', () => {
  it('draws nothing with no members and nothing pinned', () => {
    expect(ringForGroup([], { paddingLy: PADDING })).toBeNull();
    expect(ringForGroup([], { paddingLy: PADDING, ring: { innerRadiusLy: 100 } })).toBeNull();
  });

  it('gives one member a band two paddings wide around the galaxy centre', () => {
    const ring = ringForGroup([[3_000, 4_000]], { paddingLy: PADDING });
    expect(ring).toMatchObject({ center: [0, 0], innerRadiusLy: 4_500, outerRadiusLy: 5_500 });
    expect(ring?.loops).toHaveLength(2);
    expectInBand(ring!, [[3_000, 4_000]]);
  });

  it('follows two and many members, from the nearest to the farthest', () => {
    const two: PlanePoint[] = [
      [10_000, 0],
      [0, -20_000],
    ];
    const ring2 = ringForGroup(two, { paddingLy: PADDING });
    expect(ring2).toMatchObject({ innerRadiusLy: 9_500, outerRadiusLy: 20_500 });
    expectInBand(ring2!, two);

    const random = seededRandom(7);
    const many = Array.from({ length: 200 }, (): PlanePoint => {
      const angle = random() * 2 * Math.PI;
      const r = 15_000 + random() * 10_000;
      return [r * Math.cos(angle), r * Math.sin(angle)];
    });
    const ring = ringForGroup(many, { paddingLy: PADDING })!;
    expectInBand(ring, many);
    const expected = Math.PI * (ring.outerRadiusLy ** 2 - ring.innerRadiusLy ** 2);
    expect(Math.abs(fillArea(ring) - expected) / expected).toBeLessThan(0.002);
  });

  it('becomes a disc when the nearest member is within the padding of the centre', () => {
    const ring = ringForGroup(
      [
        [200, 0],
        [0, 3_000],
      ],
      { paddingLy: PADDING },
    )!;
    expect(ring.innerRadiusLy).toBe(0);
    expect(ring.loops).toHaveLength(1);
    // A fan from the centre: one triangle per step.
    expect(ring.fill.triangles).toHaveLength(ring.loops[0]!.length * 3);
  });

  it('keeps pinned radii, and draws a pinned ring with no members', () => {
    const members: PlanePoint[] = [[12_000, 0]];
    const pinned = ringForGroup(members, {
      paddingLy: PADDING,
      ring: { innerRadiusLy: 8_000, outerRadiusLy: 16_000 },
    });
    expect(pinned).toMatchObject({ innerRadiusLy: 8_000, outerRadiusLy: 16_000 });
    const empty = ringForGroup([], { paddingLy: PADDING, ring: { outerRadiusLy: 4_000 } });
    expect(empty).toMatchObject({ innerRadiusLy: 0, outerRadiusLy: 4_000 });
    const emptyBand = ringForGroup([], {
      paddingLy: PADDING,
      ring: { innerRadiusLy: 4_000, outerRadiusLy: 9_000 },
    });
    expect(emptyBand).toMatchObject({ innerRadiusLy: 4_000, outerRadiusLy: 9_000 });
    expect(emptyBand?.loops).toHaveLength(2);
  });

  it('a pinned inner radius of 0 is a disc', () => {
    const ring = ringForGroup([[6_000, 0]], { paddingLy: PADDING, ring: { innerRadiusLy: 0 } });
    expect(ring).toMatchObject({ innerRadiusLy: 0, outerRadiusLy: 6_500 });
    expect(ring?.loops).toHaveLength(1);
  });

  it('lets the following side give way when one pinned radius passes it', () => {
    const members: PlanePoint[] = [[5_000, 0]];
    const outward = ringForGroup(members, { paddingLy: PADDING, ring: { innerRadiusLy: 9_000 } });
    expect(outward).toMatchObject({ innerRadiusLy: 9_000, outerRadiusLy: 10_000 });
    const inward = ringForGroup(members, { paddingLy: PADDING, ring: { outerRadiusLy: 3_000 } });
    expect(inward).toMatchObject({ innerRadiusLy: 2_000, outerRadiusLy: 3_000 });
  });

  it('measures from a moved centre', () => {
    const ring = ringForGroup([[11_000, 0]], { paddingLy: PADDING, ring: { center: [1_000, 0] } });
    expect(ring).toMatchObject({ center: [1_000, 0], innerRadiusLy: 9_500, outerRadiusLy: 10_500 });
  });

  it('puts the label on the band, at its middle radius and the given angle', () => {
    const ring = ringForGroup([[0, 10_000]], { paddingLy: PADDING, labelDeg: 0 })!;
    expect(ring.label[0]).toBeCloseTo(10_000);
    expect(ring.label[1]).toBeCloseTo(0);
    const turned = ringForGroup([[0, 10_000]], { paddingLy: PADDING, ring: { labelDeg: 90 } })!;
    expect(turned.label[0]).toBeCloseTo(0);
    expect(turned.label[1]).toBeCloseTo(10_000);
  });

  it('uses finer steps for finer circles', () => {
    const coarse = ringForGroup([[10_000, 0]], { paddingLy: PADDING, stepDeg: 10 })!;
    const fine = ringForGroup([[10_000, 0]], { paddingLy: PADDING, stepDeg: 2 })!;
    expect(coarse.loops[0]).toHaveLength(36);
    expect(fine.loops[0]).toHaveLength(180);
  });
});

describe('GroupStyle.ring', () => {
  it('rejects an inner radius that is not smaller than the outer one', () => {
    const parse = (ring: object) => GroupStyle.safeParse({ shape: 'ring', ring }).success;
    expect(parse({ innerRadiusLy: 5_000, outerRadiusLy: 10_000 })).toBe(true);
    expect(parse({ innerRadiusLy: 10_000, outerRadiusLy: 10_000 })).toBe(false);
    expect(parse({ innerRadiusLy: 12_000, outerRadiusLy: 10_000 })).toBe(false);
    expect(parse({ innerRadiusLy: 0 })).toBe(true);
    expect(parse({ outerRadiusLy: 0 })).toBe(false);
    expect(parse({ center: [100, -200], labelDeg: 45 })).toBe(true);
    expect(GroupStyle.safeParse({ shape: 'square' }).success).toBe(false);
  });
});
