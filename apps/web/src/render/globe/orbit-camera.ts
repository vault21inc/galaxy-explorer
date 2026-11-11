import type { ViewObject } from '@ge/domain';
import type { ViewCameraConfig } from '../camera/use-view-camera.ts';
import {
  ORBIT_EXIT_RADII,
  ORBIT_FAR_RADII,
  ORBIT_FLY_TO_MIN_RADIUS,
  ORBIT_FOCUS_DISTANCE_RADII,
  ORBIT_MIN_DISTANCE_RADII,
  ORBIT_NEAR_RADII,
  ORBIT_START_DISTANCE_RADII,
  ORBIT_START_ELEVATION_DEG,
  ORBIT_START_FROM_SUN_DEG,
} from '../tuning.ts';

const DEG = Math.PI / 180;
/** Stops just short of straight over a pole, where "up" for the camera would flip. */
const POLE_MARGIN_RAD = 0.02;

type Child = Pick<ViewObject, 'id' | 'position' | 'size'>;

/**
 * The orbit view's camera (rendering.md §5), in body radii around the globe at the origin. Its
 * target stays on the globe's center, so the camera turns freely around the globe at any
 * latitude (no roll), from ORBIT_MIN_DISTANCE_RADII just above the surface out to
 * ORBIT_EXIT_RADII, where zooming further leaves the view (M5-T2's exit push).
 *
 * It starts round from the sunlit side (ORBIT_START_FROM_SUN_DEG) and a little above the
 * equator, so the globe shows both day and night: `sun` is the direction to the star.
 */
export function orbitCamera(
  subjectId: string,
  children: readonly Child[],
  sun: readonly [number, number, number],
): ViewCameraConfig {
  const [sx, , sz] = sun;
  // The sun's direction seen from above (its azimuth), turned on by the start angle.
  const azimuth = Math.atan2(sz, sx) + ORBIT_START_FROM_SUN_DEG * DEG;
  const elevation = ORBIT_START_ELEVATION_DEG * DEG;
  const distance = ORBIT_START_DISTANCE_RADII;
  return {
    key: subjectId,
    near: ORBIT_NEAR_RADII,
    far: ORBIT_FAR_RADII,
    clipping: { nearFraction: 0, minNear: ORBIT_NEAR_RADII, farBeyond: ORBIT_FAR_RADII },
    minDistance: ORBIT_MIN_DISTANCE_RADII,
    maxDistance: ORBIT_EXIT_RADII,
    minPolarAngle: POLE_MARGIN_RAD,
    maxPolarAngle: Math.PI - POLE_MARGIN_RAD,
    // The target is pinned to the center: with it elsewhere, the minimum distance could put
    // the camera inside the globe.
    targetBounds: { min: [0, 0, 0], max: [0, 0, 0] },
    position: [
      distance * Math.cos(elevation) * Math.cos(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.sin(azimuth),
    ],
    target: [0, 0, 0],
    frameMinRadius: ORBIT_FLY_TO_MIN_RADIUS,
    // Back from a moon's view: look at the moon from beyond it, seen from the center.
    focusPose: (objectId) => {
      const child = children.find((item) => item.id === objectId);
      if (!child) return null;
      const [x, y, z] = child.position;
      const length = Math.hypot(x, y, z) || 1;
      const reach = length + ORBIT_FOCUS_DISTANCE_RADII;
      return {
        position: [(x / length) * reach, (y / length) * reach, (z / length) * reach],
        target: [0, 0, 0],
      };
    },
  };
}
