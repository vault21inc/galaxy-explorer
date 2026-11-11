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
  near.set(ndcX, ndcY, -1).unproject(camera);
  far.set(ndcX, ndcY, 1).unproject(camera);
  const hit = raySphereIntersect(
    [near.x, near.y, near.z],
    [far.x - near.x, far.y - near.y, far.z - near.z],
    1,
  );
  if (!hit) return null;
  return unitVectorToLatLon(globe.toGlobe(hit));
}
