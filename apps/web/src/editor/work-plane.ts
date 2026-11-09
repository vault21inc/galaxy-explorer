import { Plane, Ray, Vector2, Vector3, type Camera } from 'three';

/**
 * Where the pointer meets the work plane (rendering.md §10): the galactic plane, y = 0, or the
 * height of the selection being moved. A ray goes from the camera through the pointer; where it
 * crosses the plane is the point. Null when the ray runs parallel to the plane or away from it
 * (the camera looking up from below the horizon, say).
 *
 * `ndc` is the pointer in normalized device coordinates: −1 to 1 across the canvas, y up.
 */
const WORK_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Ray();
const scratch = new Vector3();

export function workPlanePoint(
  camera: Camera,
  ndc: Vector2,
  heightY = 0,
): [number, number, number] | null {
  // A plane is stored as normal · p + constant = 0, so y = h is constant −h.
  WORK_PLANE.constant = -heightY;
  // Unprojecting the pointer at the near plane (z = −1) and the far plane (z = 1) gives two
  // points on the ray; for a perspective camera the first is effectively the camera position.
  ray.origin.setFromMatrixPosition(camera.matrixWorld);
  scratch.set(ndc.x, ndc.y, 0.5).unproject(camera);
  ray.direction.copy(scratch).sub(ray.origin).normalize();
  const hit = ray.intersectPlane(WORK_PLANE, scratch);
  return hit ? [hit.x, heightY, hit.z] : null;
}

/** Page coordinates to normalized device coordinates over an element. */
export function toNdc(clientX: number, clientY: number, element: Element, into = new Vector2()) {
  const rect = element.getBoundingClientRect();
  return into.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
}
