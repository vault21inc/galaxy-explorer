import type { CameraControlsImpl } from '@react-three/drei';
import { Box3, Sphere, Vector3 } from 'three';
import { drawnObjects, type DrawnObject } from '../scene-index.ts';
import { viewInsetsStore } from '@/state/view-insets.ts';
import { neighborhoodRadius } from './neighborhood.ts';
import { frameRules } from './use-view-camera.ts';
import { fitScale } from './view-shift.ts';

/** What a frame needs of something drawn: where it is and how large. */
export type FrameTarget = Pick<
  DrawnObject,
  'id' | 'center' | 'radius' | 'shape' | 'curve' | 'waypointIds' | 'offsetPx'
>;

/**
 * The sphere flying to `targets` frames (ux.md §4 F, double-click; rendering.md §5 "Flying
 * to"), in the view's unit: their bounding sphere, with the whole line of a rift or route and
 * not only its middle, and never under the view's `frameMinRadius`.
 *
 * Where the view frames by neighbors (the galaxy view's `frameNeighbors`, D-61):
 * - bodies count as points. A system's world radius there is some 120 ly, but it's drawn as a
 *   dot clamped to a few pixels (GALAXY_BODY_MAX_PX), so that radius says nothing about how
 *   close the camera can usefully come. Regions (nebulae, rifts) are as large as they're drawn;
 * - one target is widened to its neighborhood, out to its nearest few of `others`, so a star
 *   arrives among its neighbors at whatever the map's spacing is there;
 * - several targets (a selection, a group's members) set the frame's size themselves, padded
 *   so the outermost and their labels aren't on its edge.
 */
export function frameSphere(
  targets: readonly FrameTarget[],
  others: readonly FrameTarget[],
  rules: ReturnType<typeof frameRules>,
): Sphere {
  const neighbors = rules.frameNeighbors;
  const radiusOf = (target: FrameTarget) =>
    neighbors && !target.shape && !target.curve ? 0 : target.radius;
  const [only] = targets;
  const sphere = new Sphere();
  if (only && targets.length === 1 && !only.curve) {
    // One round thing is its own sphere: a box around it would add its corners (× √3).
    sphere.set(new Vector3(...only.center), radiusOf(only));
    if (neighbors) {
      // Bodies and regions are neighbors. Routes (lines between them) and event markers (drawn
      // beside the system they're at, at its very position) aren't.
      const centers = others
        .filter((other) => other.id !== only.id && !other.waypointIds && !other.offsetPx)
        .map((other) => other.center);
      sphere.radius = Math.max(sphere.radius, neighborhoodRadius(only.center, centers, neighbors));
    }
  } else {
    const box = new Box3();
    const point = new Vector3();
    for (const target of targets) {
      const radius = radiusOf(target);
      for (const [x, y, z] of target.curve ?? [target.center]) {
        box.expandByPoint(point.set(x, y, z).addScalar(radius));
        box.expandByPoint(point.set(x, y, z).addScalar(-radius));
      }
    }
    box.getBoundingSphere(sphere);
    if (neighbors) sphere.radius *= neighbors.padding;
  }
  sphere.radius = Math.max(sphere.radius, rules.frameMinRadius);
  return sphere;
}

/**
 * Flies the camera to frame `targets`, keeping the current viewing angle: `frameSphere` says
 * what to frame, and camera-controls' `fitToSphere` picks the distance at which that sphere
 * just fills the view. Resolves when the camera has settled.
 *
 * With the details panel open over the map (a phone), the view is the part it leaves
 * uncovered, where the picture is centered (rendering.md §12, "The view shift"): the sphere is
 * framed as if larger, by `fitScale`, so it fits that part. The canvas fills the window, so
 * the window's size is the canvas's.
 */
export async function flyTo(
  controls: CameraControlsImpl,
  targets: readonly FrameTarget[],
): Promise<void> {
  if (targets.length === 0) return;
  const sphere = frameSphere(targets, drawnObjects(), frameRules());
  sphere.radius *= fitScale(
    { width: window.innerWidth, height: window.innerHeight },
    viewInsetsStore.getState(),
  );
  await controls.fitToSphere(sphere, true);
}
