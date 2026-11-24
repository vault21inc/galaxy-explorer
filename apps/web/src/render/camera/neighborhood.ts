type Point = readonly [number, number, number];

/** How a neighborhood is measured: the galaxy view's tunables (tuning.ts, FLY_TO_NEIGHBOR_*). */
export interface NeighborhoodRules {
  /** Reach out to this many of the nearest neighbors at most. */
  count: number;
  /** After this many, stop before a neighbor more than `gap` times farther than the last. */
  minCount: number;
  gap: number;
  /** The radius is this much wider than the reach. */
  padding: number;
  maxRadius: number;
}

/**
 * How wide an object's neighborhood is (D-61, rendering.md §5 "Flying to"): the distance from
 * `center` to the farthest of its nearest `count` of `others`, times `padding`, and never more
 * than `maxRadius`.
 *
 * Maps differ in spacing by orders of magnitude, and so do parts of one map: the stars around
 * the Sun are 4 to 12 ly apart, a sector's capitals hundreds. A fixed radius is right for one
 * and useless for the other, so the frame comes from the neighbors themselves.
 *
 * A cluster of five with nothing else for 20,000 ly is a neighborhood of five: counting on to
 * the eighth would frame the gap and shrink the cluster to a dot. So once `minCount` neighbors
 * are in, the reach stops before one more than `gap` times farther than the last. With no
 * others at all, it's `maxRadius`.
 *
 * Called on a key press or a view change, never per frame, so the array and the sort are fine.
 */
export function neighborhoodRadius(
  center: Point,
  others: Iterable<Point>,
  rules: NeighborhoodRules,
): number {
  const distances: number[] = [];
  for (const [x, y, z] of others) {
    distances.push(Math.hypot(x - center[0], y - center[1], z - center[2]));
  }
  distances.sort((a, b) => a - b);
  const [nearest, ...farther] = distances;
  if (nearest === undefined) return rules.maxRadius;
  let reach = nearest;
  for (const [index, next] of farther.slice(0, rules.count - 1).entries()) {
    // `index + 1` neighbors are in so far.
    if (index + 1 >= rules.minCount && next > reach * rules.gap) break;
    reach = next;
  }
  return Math.min(reach * rules.padding, rules.maxRadius);
}

/**
 * How far back a camera stands for a sphere of `radius` to just fit its view: the sphere
 * touches the view's edges where the angle from the line of sight is half the field of view,
 * so distance = radius / sin(fov / 2). The narrower of the vertical and horizontal fields
 * decides, which on a phone held upright is the horizontal one: tan(h / 2) = tan(v / 2) ×
 * aspect. This is what camera-controls' `fitToSphere` computes; here it's for poses built
 * without the controls (galaxy-camera.ts `focusPose`).
 */
export function distanceToFit(radius: number, verticalFovDeg: number, aspect: number): number {
  const halfVertical = (verticalFovDeg * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  return radius / Math.sin(Math.min(halfVertical, halfHorizontal));
}
