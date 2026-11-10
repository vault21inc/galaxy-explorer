import type { ViewObject } from '@ge/domain';
import type { ViewCameraConfig } from '../camera/use-view-camera.ts';
import {
  POLAR_MAX_DEG,
  POLAR_MIN_DEG,
  SYSTEM_EXIT_EXTENTS,
  SYSTEM_FAR_SU,
  SYSTEM_FLY_TO_MIN_RADIUS_SU,
  SYSTEM_FOCUS_DISTANCE_EXTENTS,
  SYSTEM_MIN_DISTANCE_SU,
  SYSTEM_MIN_EXTENT_SU,
  SYSTEM_NEAR_SU,
  SYSTEM_START_DISTANCE_EXTENTS,
  SYSTEM_START_TILT_DEG,
  SYSTEM_TARGET_EXTENTS,
  SYSTEM_TARGET_HEIGHT_EXTENTS,
} from '../tuning.ts';

const DEG = Math.PI / 180;

type Child = Pick<ViewObject, 'id' | 'position' | 'size'>;

/**
 * How far a system reaches, in system units: the distance from its center to the outer edge of
 * its farthest child, measured in the orbital (X/Z) plane, and at least SYSTEM_MIN_EXTENT_SU.
 */
export function systemExtentSu(children: readonly Child[]): number {
  let extent = SYSTEM_MIN_EXTENT_SU;
  for (const { position, size } of children) {
    const [x, , z] = position;
    extent = Math.max(extent, Math.hypot(x, z) + (size ?? 0));
  }
  return extent;
}

/**
 * The system view's camera (rendering.md §5), in system units. It starts looking at the center
 * from SYSTEM_START_DISTANCE_EXTENTS away, so every orbit is in view, and may pull back to
 * SYSTEM_EXIT_EXTENTS, where zooming out further leaves the system (M5-T2).
 *
 * The clipping planes are fixed: near 0.01 su, far 10,000 su is a range a depth buffer handles
 * at these scales, unlike the galaxy's, which spans a millionfold more.
 *
 * The setup is applied once per system (`key`): adding a planet farther out while editing
 * doesn't throw the camera back to its start.
 */
export function systemCamera(systemId: string, children: readonly Child[]): ViewCameraConfig {
  const extent = systemExtentSu(children);
  const distance = SYSTEM_START_DISTANCE_EXTENTS * extent;
  const tilt = SYSTEM_START_TILT_DEG * DEG;
  const across = SYSTEM_TARGET_EXTENTS * extent;
  const height = SYSTEM_TARGET_HEIGHT_EXTENTS * extent;
  return {
    key: systemId,
    near: SYSTEM_NEAR_SU,
    far: SYSTEM_FAR_SU,
    // nearFraction 0: near stays at minNear; far always reaches well past the system.
    clipping: { nearFraction: 0, minNear: SYSTEM_NEAR_SU, farBeyond: SYSTEM_FAR_SU },
    minDistance: SYSTEM_MIN_DISTANCE_SU,
    maxDistance: SYSTEM_EXIT_EXTENTS * extent,
    minPolarAngle: POLAR_MIN_DEG * DEG,
    maxPolarAngle: POLAR_MAX_DEG * DEG,
    targetBounds: { min: [-across, -height, -across], max: [across, height, across] },
    // +Y is the system's north: up by cos(tilt), toward the viewer by sin(tilt).
    position: [0, distance * Math.cos(tilt), distance * Math.sin(tilt)],
    target: [0, 0, 0],
    frameMinRadius: SYSTEM_FLY_TO_MIN_RADIUS_SU,
    focusPose: (objectId) => {
      const child = children.find((item) => item.id === objectId);
      if (!child) return null;
      const [x, y, z] = child.position;
      const away = SYSTEM_FOCUS_DISTANCE_EXTENTS * extent;
      return {
        position: [x, y + away * Math.cos(tilt), z + away * Math.sin(tilt)],
        target: [x, y, z],
      };
    },
  };
}
