import type { PlanePoint } from '@ge/domain';

/**
 * Editing a rift's points (M4-T6), as pure functions of its path: [x, z] in light-years,
 * relative to the rift object's position. The schema allows 2 to 64 points.
 */
export const RIFT_MIN_POINTS = 2;
export const RIFT_MAX_POINTS = 64;

/**
 * A new point, added at whichever end of the path it's nearer: clicking past the end extends
 * the rift there, clicking past its start extends it back. Null when the path is full.
 */
export function addRiftPoint(path: readonly PlanePoint[], point: PlanePoint): PlanePoint[] | null {
  if (path.length >= RIFT_MAX_POINTS) return null;
  const first = path[0];
  const last = path.at(-1);
  if (!first || !last) return [point];
  const toFirst = Math.hypot(point[0] - first[0], point[1] - first[1]);
  const toLast = Math.hypot(point[0] - last[0], point[1] - last[1]);
  return toFirst < toLast ? [point, ...path] : [...path, point];
}

export function moveRiftPoint(
  path: readonly PlanePoint[],
  index: number,
  point: PlanePoint,
): PlanePoint[] {
  return path.map((item, i) => (i === index ? point : item));
}

/** The path without one point, or null when that would leave fewer than two. */
export function removeRiftPoint(path: readonly PlanePoint[], index: number): PlanePoint[] | null {
  if (path.length <= RIFT_MIN_POINTS || index < 0 || index >= path.length) return null;
  return path.filter((_, i) => i !== index);
}
