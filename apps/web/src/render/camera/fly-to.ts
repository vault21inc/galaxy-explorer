import type { CameraControlsImpl } from '@react-three/drei';
import { Box3, Sphere, Vector3 } from 'three';
import type { DrawnObject } from '../scene-index.ts';
import { viewInsetsStore } from '@/state/view-insets.ts';
import { frameMinRadius } from './use-view-camera.ts';
import { fitScale } from './view-shift.ts';

/**
 * Flies the camera to frame objects (ux.md §4 F, double-click): their bounding sphere, at least
 * the current view's `frameMinRadius` in radius (FLY_TO_MIN_RADIUS_LY in the galaxy view),
 * keeping the current viewing angle. camera-controls' `fitToSphere` picks the distance at which
 * the sphere just fills the view. Resolves when the camera has settled.
 *
 * With the details panel open over the map (a phone), the view is the part it leaves
 * uncovered, where the picture is centered (rendering.md §12, "The view shift"): the sphere is
 * framed as if larger, by `fitScale`, so it fits that part. The canvas fills the window, so
 * the window's size is the canvas's.
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
  sphere.radius = Math.max(sphere.radius, frameMinRadius());
  sphere.radius *= fitScale(
    { width: window.innerWidth, height: window.innerHeight },
    viewInsetsStore.getState(),
  );
  await controls.fitToSphere(sphere, true);
}
