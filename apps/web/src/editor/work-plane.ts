import { Plane, Ray, Vector2, Vector3, type Camera } from 'three';
import { equatorToView, poleInView, viewToEquator } from '@/render/orbits/equator-frame.ts';

/**
 * Where the pointer meets the work plane (rendering.md §10): the galactic plane, y = 0, or the
 * height of the selection being moved. A ray goes from the camera through the pointer; where it
 * crosses the plane is the point. Null when the ray runs parallel to the plane or away from it
 * (the camera looking up from below the horizon, say).
 *
 * Null too when the crossing lies farther than `maxRadiusLy` from the galaxy's center. Near the
 * horizon the ray meets the plane at a grazing angle, and a pixel of pointer movement there
 * moves the crossing by thousands of light-years: a drag that strayed there once put an object
 * 90 galaxy radii out. Beyond the limit the drag simply stops following.
 *
 * `ndc` is the pointer in normalized device coordinates: −1 to 1 across the canvas, y up.
 *
 * `tiltRad` tilts the plane: in the orbit view it's the plane of the planet's equator, turned
 * by its axial tilt (D-60, orbits/equator-frame.ts). The plane's normal is then the planet's
 * pole, the height is measured along it, and so is the limit: the distance from the pole's
 * axis. The point returned is in the view, where it's drawn.
 */
const WORK_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Ray();
const scratch = new Vector3();

export function workPlanePoint(
  camera: Camera,
  ndc: Vector2,
  heightY = 0,
  maxRadiusLy = Infinity,
  tiltRad = 0,
): [number, number, number] | null {
  // A plane is stored as normal · p + constant = 0, so height h along the normal is constant −h.
  WORK_PLANE.normal.set(...poleInView(tiltRad));
  WORK_PLANE.constant = -heightY;
  // Unprojecting the pointer at the near plane (z = −1) and the far plane (z = 1) gives two
  // points on the ray; for a perspective camera the first is effectively the camera position.
  ray.origin.setFromMatrixPosition(camera.matrixWorld);
  scratch.set(ndc.x, ndc.y, 0.5).unproject(camera);
  ray.direction.copy(scratch).sub(ray.origin).normalize();
  const hit = ray.intersectPlane(WORK_PLANE, scratch);
  if (!hit) return null;
  // In the plane's own frame the hit is (x, height, z): the limit is on x and z, and the height
  // is set exactly, so rounding never lifts a dragged object off the plane.
  const [x, , z] = viewToEquator([hit.x, hit.y, hit.z], tiltRad);
  if (Math.hypot(x, z) > maxRadiusLy) return null;
  return equatorToView([x, heightY, z], tiltRad);
}

/** A point's height above the work plane (along its normal), as `workPlanePoint` measures it. */
export function heightAbovePlane(point: readonly [number, number, number], tiltRad = 0): number {
  return viewToEquator(point, tiltRad)[1];
}

/** Page coordinates to normalized device coordinates over an element. */
export function toNdc(clientX: number, clientY: number, element: Element, into = new Vector2()) {
  const rect = element.getBoundingClientRect();
  return into.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
}
