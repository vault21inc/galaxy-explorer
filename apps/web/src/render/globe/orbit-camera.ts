import type { ViewObject } from '@ge/domain';
import type { ViewCameraConfig } from '../camera/use-view-camera.ts';
import {
  ORBIT_EXIT_BEYOND_START,
  ORBIT_EXIT_RADII,
  ORBIT_FRAME_EXTENTS,
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

/** How far the globe's company reaches: its farthest child's outer edge, in radii. */
export function orbitExtentRadii(children: readonly Child[]): number {
  let extent = 0;
  for (const { position, size } of children) {
    extent = Math.max(extent, Math.hypot(...position) + (size ?? 0));
  }
  return extent;
}

/**
 * The orbit view's camera (rendering.md §5), in body radii around the globe at the origin. It
 * turns freely around the globe at any latitude (no roll), from ORBIT_MIN_DISTANCE_RADII just
 * above the surface out to ORBIT_EXIT_RADII (further when the moons reach further), where
 * zooming out more leaves the view (M5-T2's exit push). Its target may move to a moon, but
 * the camera itself never enters the globe (`keepOutsideRadius`).
 *
 * It starts round from the sunlit side (ORBIT_START_FROM_SUN_DEG) and above the equator, so
 * the globe shows day and night, and far enough out to show every moon and station: `sun` is
 * the direction to the star.
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
  // Far enough to show everything that orbits the globe, so nobody misses a moon.
  const extent = orbitExtentRadii(children);
  const distance = Math.max(ORBIT_START_DISTANCE_RADII, ORBIT_FRAME_EXTENTS * extent);
  const reach = Math.max(1, extent);
  return {
    key: subjectId,
    near: ORBIT_NEAR_RADII,
    far: ORBIT_FAR_RADII,
    clipping: { nearFraction: 0, minNear: ORBIT_NEAR_RADII, farBeyond: ORBIT_FAR_RADII },
    minDistance: ORBIT_MIN_DISTANCE_RADII,
    // Exit beyond 8 radii, or further out when the moons reach further.
    maxDistance: Math.max(ORBIT_EXIT_RADII, distance * ORBIT_EXIT_BEYOND_START),
    minPolarAngle: POLE_MARGIN_RAD,
    maxPolarAngle: Math.PI - POLE_MARGIN_RAD,
    // The target may move to a moon (flying to it, zooming toward it); the camera itself is
    // kept outside the globe whatever it turns around.
    targetBounds: { min: [-reach, -reach, -reach], max: [reach, reach, reach] },
    keepOutsideRadius: ORBIT_MIN_DISTANCE_RADII,
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
