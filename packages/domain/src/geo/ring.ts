import type { GroupRing } from '../schemas/styles.ts';
import { fanFill, type GroupFigure, type PlanePoint } from './outline.ts';

/**
 * A ring group's shape on the galactic plane (D-53, rendering.md §6): the band between two
 * circles around a centre, usually the galaxy's. It's for regions that are concentric bands,
 * such as a Core, a Mid Rim and an Outer Rim, whose convex hulls would each cover the whole disc.
 *
 * - **The radii follow the members** unless pinned: the inner circle passes `paddingLy` inside
 *   the member nearest the centre, the outer one `paddingLy` outside the farthest. One member, or
 *   all at one distance, gives a band two paddings wide.
 * - **A pinned radius stays put.** If it leaves no room for the other one, the other gives way
 *   to keep the band two paddings wide; members may then lie outside it, which is what pinning
 *   asked for. A ring whose outer radius is pinned is drawn even with no members (inner 0, or
 *   the pinned inner).
 * - **An inner radius of 0 is a disc:** one circle, filled as a fan from the centre.
 * - **The fill is a strip of quads** between the two circles, two triangles per step, so there's
 *   no polygon with a hole to triangulate.
 * - **The label sits on the band,** at its middle radius and at `labelDeg` around the centre.
 */

export interface RingOptions {
  /** How far the band stays from every member, in light-years. */
  paddingLy: number;
  /** The group's `style.ring`: what's pinned. */
  ring?: GroupRing | undefined;
  /**
   * Degrees between the circles' points. A circle 50,000 ly across needs much finer steps than a
   * hull's corner arcs (15°), or it shows its corners; 2° is 180 points.
   */
  stepDeg?: number;
  /** Where the label goes when the ring doesn't say (degrees from +x toward +z). */
  labelDeg?: number;
}

export interface Ring extends GroupFigure {
  center: PlanePoint;
  /** As drawn: 0 for a disc. */
  innerRadiusLy: number;
  outerRadiusLy: number;
}

const DEG = Math.PI / 180;

/** The circle of `radius` around `center` as `count` points, counter-clockwise from +x. */
function circle(center: PlanePoint, radius: number, count: number): PlanePoint[] {
  return Array.from({ length: count }, (_, index): PlanePoint => {
    const angle = (index / count) * 2 * Math.PI;
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  });
}

/** The ring for these members' (x, z) positions, or null when there's nothing to draw. */
export function ringForGroup(
  points: readonly PlanePoint[],
  { paddingLy, ring = {}, stepDeg = 2, labelDeg = -90 }: RingOptions,
): Ring | null {
  const center: PlanePoint = ring.center ?? [0, 0];
  const distances = points.map(([x, z]) => Math.hypot(x - center[0], z - center[1]));
  const minWidth = 2 * paddingLy;

  let inner: number;
  let outer: number;
  if (distances.length === 0) {
    // Nothing to follow: only a pinned outer circle says where the ring is.
    if (ring.outerRadiusLy === undefined) return null;
    outer = ring.outerRadiusLy;
    inner = Math.min(ring.innerRadiusLy ?? 0, outer);
  } else {
    const nearest = Math.min(...distances);
    const farthest = Math.max(...distances);
    outer = ring.outerRadiusLy ?? farthest + paddingLy;
    inner = ring.innerRadiusLy ?? Math.max(0, nearest - paddingLy);
    // One side pinned past the other: the side that follows the members gives way.
    if (ring.outerRadiusLy === undefined) outer = Math.max(outer, inner + minWidth);
    else if (ring.innerRadiusLy === undefined)
      inner = Math.max(0, Math.min(inner, outer - minWidth));
  }
  if (!(outer > 0)) return null;

  const count = Math.max(3, Math.ceil(360 / stepDeg));
  // A circle drawn as chords cuts inside it by r·(1 − cos(half a step)). Pushing the outer
  // circle's points out by 1 / cos(half a step) puts its chords on or outside the true circle,
  // so every member stays at least the padding inside. The inner circle's chords already lie
  // inside its circle, which only widens the band.
  const outerLoop = circle(center, outer / Math.cos(Math.PI / count), count);
  const angle = (ring.labelDeg ?? labelDeg) * DEG;
  const middle = (inner + outer) / 2;
  const label: PlanePoint = [
    center[0] + middle * Math.cos(angle),
    center[1] + middle * Math.sin(angle),
  ];

  if (inner <= 0) {
    return {
      center,
      innerRadiusLy: 0,
      outerRadiusLy: outer,
      loops: [outerLoop],
      fill: fanFill(outerLoop, center),
      label,
    };
  }

  const innerLoop = circle(center, inner, count);
  // Vertices: the outer circle's points, then the inner's, at the same angles. Each step is a
  // quad of the two points on each circle, as two triangles.
  const triangles: number[] = [];
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    triangles.push(i, next, count + next, i, count + next, count + i);
  }
  return {
    center,
    innerRadiusLy: inner,
    outerRadiusLy: outer,
    loops: [outerLoop, innerLoop],
    fill: { vertices: [...outerLoop, ...innerLoop], triangles },
    label,
  };
}
