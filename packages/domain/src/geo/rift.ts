import type { PlanePoint } from './outline.ts';

/**
 * A rift's center line (M4-T6, rendering.md §6): a smooth curve through its points, and points
 * spread evenly along it, for its billboards, its ribbon and picking. Pure.
 */

/**
 * A rift with no points of its own: a straight band eight half-widths long, through the
 * object's position, so a new rift is visible straight away.
 */
export function defaultRiftPath(radiusLy: number): PlanePoint[] {
  return [
    [-4 * radiusLy, 0],
    [4 * radiusLy, 0],
  ];
}

/**
 * A Catmull-Rom spline through the points, `steps` short segments per span, as a polyline.
 * Catmull-Rom passes through every point, unlike Bézier curves, which only head toward theirs,
 * so the curve goes exactly where the owner clicked. Each span from p1 to p2 also looks at the
 * points before (p0) and after (p3) to bend smoothly; at the ends the end point stands in for
 * the missing neighbor. Two points give a straight line.
 */
export function catmullRom(points: readonly PlanePoint[], steps = 12): PlanePoint[] {
  const [first] = points;
  if (!first) return [];
  if (points.length === 1) return [first];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))] ?? first;
  const curve: PlanePoint[] = [first];
  for (let span = 0; span < points.length - 1; span++) {
    const [p0, p1, p2, p3] = [at(span - 1), at(span), at(span + 1), at(span + 2)];
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      // The uniform Catmull-Rom basis: a cubic through p1 (t = 0) and p2 (t = 1) whose
      // tangents there are half the chord between each point's neighbors.
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      curve.push([blend(p0[0], p1[0], p2[0], p3[0]), blend(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return curve;
}

/** A polyline's length. */
export function polylineLength(points: readonly PlanePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

/** A point on a polyline, with the curve's direction there (a unit vector). */
export interface CurvePoint {
  point: PlanePoint;
  tangent: PlanePoint;
}

/**
 * `count` points spread evenly by length along a polyline, from one end to the other. Evenly
 * by length rather than by parameter, so billboards don't bunch where the owner's points are
 * close together.
 */
export function pointsAlong(curve: readonly PlanePoint[], count: number): CurvePoint[] {
  const total = polylineLength(curve);
  const [first] = curve;
  if (!first || count <= 0) return [];
  if (curve.length === 1 || total === 0) {
    return Array.from({ length: count }, () => ({ point: first, tangent: [1, 0] }));
  }
  const result: CurvePoint[] = [];
  let segment = 1;
  let walked = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? total / 2 : (total * k) / (count - 1);
    // Walk forward to the segment that holds this distance.
    for (;;) {
      const a = curve[segment - 1] ?? first;
      const b = curve[segment] ?? a;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (walked + length >= target || segment >= curve.length - 1) {
        const t = length === 0 ? 0 : Math.min(1, Math.max(0, (target - walked) / length));
        const tangent: PlanePoint =
          length === 0 ? [1, 0] : [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        result.push({ point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], tangent });
        break;
      }
      walked += length;
      segment++;
    }
  }
  return result;
}

/** The shortest distance from a point to a polyline. */
export function distanceToPolyline(point: PlanePoint, curve: readonly PlanePoint[]): number {
  let best = Infinity;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (!a || !b) continue;
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const length2 = dx * dx + dz * dz;
    const t =
      length2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2));
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  if (curve.length === 1 && curve[0]) {
    best = Math.hypot(point[0] - curve[0][0], point[1] - curve[0][1]);
  }
  return best;
}
