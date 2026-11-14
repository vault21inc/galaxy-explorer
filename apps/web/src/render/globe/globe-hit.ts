import { raySphereIntersect, unitVectorToLatLon, type LatLon } from '@ge/domain';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { globeState } from './globe-state.ts';

const near = new Vector3();
const far = new Vector3();

/**
 * Where a point on the canvas (normalized device coordinates, −1 to 1) meets the orbit view's
 * globe, as a latitude and longitude, or null if it misses (rendering.md §8, M6-T5).
 *
 * The ray from the camera through that point is found by un-projecting the point at the near
 * and far ends of the view; its first hit on the unit sphere at the origin (M6-T1's
 * `raySphereIntersect`) is a world point, which the globe's tilt and turn are taken off before
 * it's read as a latitude and longitude.
 */
export function globeLatLonAt(camera: Camera, ndcX: number, ndcY: number): LatLon | null {
  const globe = globeState();
  if (!globe) return null;
  const hit = globeHit(camera, ndcX, ndcY);
  return hit ? unitVectorToLatLon(globe.toGlobe(hit)) : null;
}

/**
 * The orbit view's subject, if a point on the canvas falls on its globe, else null: a click
 * there selects the world itself (use-pointer-selection.ts), when nothing in front of it (a
 * pin, a moon, a label) took the click first. The globe stays out of the scene index, so
 * hovering, dragging, box selection and zooming over it work as before.
 */
export function globeSubjectAt(camera: Camera, ndcX: number, ndcY: number): string | null {
  const globe = globeState();
  if (!globe) return null;
  return globeHit(camera, ndcX, ndcY) ? globe.subjectId : null;
}

/** Where the ray through a canvas point first meets the unit sphere, in world space. */
function globeHit(camera: Camera, ndcX: number, ndcY: number) {
  near.set(ndcX, ndcY, -1).unproject(camera);
  far.set(ndcX, ndcY, 1).unproject(camera);
  return raySphereIntersect(
    [near.x, near.y, near.z],
    [far.x - near.x, far.y - near.y, far.z - near.z],
    1,
  );
}
