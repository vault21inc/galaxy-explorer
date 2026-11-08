import type { CameraControlsImpl } from '@react-three/drei';
import { Box3, Sphere, Vector3 } from 'three';
import type { DrawnObject } from '../scene-index.ts';
import { FLY_TO_MIN_RADIUS_LY } from '../tuning.ts';

/**
 * Flies the camera to frame objects (ux.md §4 F, double-click): their bounding sphere, at least
 * FLY_TO_MIN_RADIUS_LY in radius, keeping the current viewing angle. camera-controls'
 * `fitToSphere` picks the distance at which the sphere just fills the view. Resolves when the
 * camera has settled.
 */
export async function flyTo(
  controls: CameraControlsImpl,
  objects: readonly DrawnObject[],
): Promise<void> {
  if (objects.length === 0) return;
  const box = new Box3();
  for (const object of objects) {
    const center = new Vector3(...object.center);
    box.expandByPoint(center.clone().addScalar(object.radius));
    box.expandByPoint(center.clone().addScalar(-object.radius));
  }
  const sphere = box.getBoundingSphere(new Sphere());
  sphere.radius = Math.max(sphere.radius, FLY_TO_MIN_RADIUS_LY);
  await controls.fitToSphere(sphere, true);
}
