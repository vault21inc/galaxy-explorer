/**
 * A group's outline on the galactic plane (rendering.md §6, M4-T3): a smooth closed curve
 * around its members' (x, z) positions, `padding` away from them. Pure math, so it's
 * unit-tested and shared with anything else that needs the shape (picking, export).
 *
 * The steps:
 * 1. **Convex hull** (Andrew's monotone chain): the smallest convex polygon around the points.
 * 2. **Outward offset with round joins:** every hull edge pushed out by the padding, with a
 *    circular arc around each corner. One point gives a circle, two give a capsule.
 * 3. **Chaikin smoothing**, twice: each edge's corners are cut at a quarter and three quarters
 *    along, which rounds the joins between straight sides and arcs.
 * 4. The **area centroid**, where the group's label goes.
 */

/** A point on the galactic plane: [x, z] in light-years. */
export type PlanePoint = readonly [number, number];

/**
 * A group's shape on the plane in one form for every `GroupStyle.shape` (D-53), so the renderer
 * has one code path: the closed loops to draw as lines (one for a hull or a disc, two for a
 * ring), the triangles that fill it, and where its label goes.
 */
export interface GroupFigure {
  /** Closed polylines; the last point of each joins its first. */
  loops: PlanePoint[][];
  /** The fill: points, and three indices into them per triangle. */
  fill: { vertices: PlanePoint[]; triangles: number[] };
  /** Where the label goes. */
  label: PlanePoint;
}

export interface Outline extends GroupFigure {
  /** The closed curve, counter-clockwise seen from +y; the last point joins the first. */
  points: PlanePoint[];
  /** The area centroid, for the label. */
  centroid: PlanePoint;
}

export interface OutlineOptions {
  /** How far the outline stays from every member, in light-years. */
  paddingLy: number;
  /** Arc points around each corner: at most this many degrees apart. */
  arcStepDeg?: number;
  /** Chaikin passes. */
  smoothing?: number;
}

/**
 * Smoothing only ever moves the curve inward: an arc drawn as chords 15° apart dips about 0.9%
 * below its radius, and each Chaikin pass cuts a little off the corners between chords. Offsetting
 * by 2% more than the padding keeps every member at least `paddingLy` inside (the unit tests
 * check that exact claim).
 */
const SMOOTHING_SLACK = 1.02;

/**
 * The point at `index` of a closed polyline, wrapping around either end: index -1 is the last
 * point and `length` the first. Throws on an empty list, which callers rule out first.
 */
function vertexAt(points: readonly PlanePoint[], index: number): PlanePoint {
  const point = points[((index % points.length) + points.length) % points.length];
  if (!point) throw new Error('A polyline needs at least one point.');
  return point;
}

/** Andrew's monotone chain: the convex hull, counter-clockwise, without collinear points. */
export function convexHull(input: readonly PlanePoint[]): PlanePoint[] {
  const points = input
    .toSorted((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((point, index, all) => {
      const previous = all[index - 1];
      return previous?.[0] !== point[0] || previous[1] !== point[1];
    });
  if (points.length <= 2) return points;
  // Positive when o → a → b turns left (counter-clockwise).
  const cross = (o: PlanePoint, a: PlanePoint, b: PlanePoint) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (sorted: readonly PlanePoint[]) => {
    const hull: PlanePoint[] = [];
    for (const point of sorted) {
      // Pop while the last two and this one don't turn left: they're inside or on a straight line.
      while (hull.length >= 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        if (!a || !b || cross(a, b, point) > 0) break;
        hull.pop();
      }
      hull.push(point);
    }
    // The last point starts the other chain.
    hull.pop();
    return hull;
  };
  const hull = [...chain(points), ...chain(points.toReversed())];
  // All points on one line: the hull is just its two ends.
  return hull.length >= 2 ? hull : [vertexAt(points, 0), vertexAt(points, -1)];
}

/**
 * Pushes a convex counter-clockwise polygon out by `distance`, rounding each corner with an arc
 * around the corner point. On a counter-clockwise polygon an edge's outward side is its right:
 * for direction (dx, dz) the outward normal is (dz, -dx). Each corner's arc turns from the
 * incoming edge's normal to the outgoing edge's, counter-clockwise, through the corner's
 * exterior angle.
 */
export function offsetConvex(hull: readonly PlanePoint[], distance: number, stepDeg = 15) {
  const step = (stepDeg * Math.PI) / 180;
  const [first] = hull;
  if (!first) return [];
  if (hull.length === 1) {
    const count = Math.ceil((2 * Math.PI) / step);
    return Array.from({ length: count }, (_, index): PlanePoint => {
      const angle = (index / count) * 2 * Math.PI;
      return [first[0] + distance * Math.cos(angle), first[1] + distance * Math.sin(angle)];
    });
  }
  const normalAngle = (from: PlanePoint, to: PlanePoint) =>
    Math.atan2(-(to[0] - from[0]), to[1] - from[1]);
  const out: PlanePoint[] = [];
  for (let index = 0; index < hull.length; index++) {
    const corner = vertexAt(hull, index);
    const previous = vertexAt(hull, index - 1);
    const next = vertexAt(hull, index + 1);
    // atan2(z, x) of the normals: (dz, -dx) has x = dz and z = -dx.
    const start = normalAngle(previous, corner);
    let sweep = normalAngle(corner, next) - start;
    while (sweep < 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(sweep / step));
    for (let s = 0; s <= steps; s++) {
      const angle = start + (sweep * s) / steps;
      out.push([corner[0] + distance * Math.cos(angle), corner[1] + distance * Math.sin(angle)]);
    }
  }
  return out;
}

/** One pass of Chaikin's corner cutting on a closed polyline. */
export function chaikin(points: readonly PlanePoint[]): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (let index = 0; index < points.length; index++) {
    const a = vertexAt(points, index);
    const b = vertexAt(points, index + 1);
    out.push(
      [0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]],
      [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]],
    );
  }
  return out;
}

/** The area centroid of a closed polygon (the shoelace formula), or the mean for no area. */
export function areaCentroid(points: readonly PlanePoint[]): PlanePoint {
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let index = 0; index < points.length; index++) {
    const a = vertexAt(points, index);
    const b = vertexAt(points, index + 1);
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    cx += (a[0] + b[0]) * cross;
    cz += (a[1] + b[1]) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    const n = Math.max(points.length, 1);
    return [
      points.reduce((sum, point) => sum + point[0], 0) / n,
      points.reduce((sum, point) => sum + point[1], 0) / n,
    ];
  }
  return [cx / (3 * area), cz / (3 * area)];
}

/**
 * A fan of triangles from `center` to each edge of a closed loop: exactly covers a convex loop,
 * or any loop every point of which `center` can see (a circle from its middle).
 */
export function fanFill(loop: readonly PlanePoint[], center: PlanePoint): GroupFigure['fill'] {
  const count = loop.length;
  const triangles: number[] = [];
  // Vertex 0 is the centre; the loop's points follow from 1.
  for (let i = 0; i < count; i++) triangles.push(0, 1 + i, 1 + ((i + 1) % count));
  return { vertices: [center, ...loop], triangles };
}

/** The outline around these points, or null for none (rendering.md §6). */
export function outlineForGroup(
  points: readonly PlanePoint[],
  { paddingLy, arcStepDeg = 15, smoothing = 2 }: OutlineOptions,
): Outline | null {
  const hull = convexHull(points);
  if (hull.length === 0) return null;
  let curve = offsetConvex(hull, paddingLy * SMOOTHING_SLACK, arcStepDeg);
  for (let pass = 0; pass < smoothing; pass++) curve = chaikin(curve);
  const centroid = areaCentroid(curve);
  return {
    points: curve,
    centroid,
    loops: [curve],
    // The hull is convex, so a fan from its centroid covers it.
    fill: fanFill(curve, centroid),
    label: centroid,
  };
}
