import type { ResolvedGalaxySettings, ViewObject } from '@ge/domain';
import { distanceToFit, neighborhoodRadius } from '../camera/neighborhood.ts';
import type { ViewCameraConfig } from '../camera/use-view-camera.ts';
import {
  GALAXY_DISC_EXTENT_RADII,
  GALAXY_FAR_BEYOND_RADII,
  GALAXY_FAR_RADII,
  GALAXY_MAX_DISTANCE_RADII,
  GALAXY_MIN_DISTANCE_LY,
  GALAXY_MIN_NEAR_LY,
  GALAXY_NEAR_FRACTION,
  GALAXY_NEAR_RADII,
  GALAXY_START_DISTANCE_RADII,
  GALAXY_START_TILT_DEG,
  GALAXY_TARGET_HEIGHT_RADII,
  POLAR_MAX_DEG,
  POLAR_MIN_DEG,
  CAMERA_FOV_DEG,
  FLY_TO_MAX_NEIGHBORHOOD_LY,
  FLY_TO_MIN_RADIUS_LY,
  FLY_TO_NEIGHBOR_COUNT,
  FLY_TO_NEIGHBOR_GAP,
  FLY_TO_NEIGHBOR_MIN_COUNT,
  FLY_TO_NEIGHBORHOOD_PADDING,
} from '../tuning.ts';

const DEG = Math.PI / 180;

/**
 * The galaxy view's camera (rendering.md §5), in light-years. It starts looking at the center
 * from GALAXY_START_DISTANCE_RADII away, tilted GALAXY_START_TILT_DEG from straight down: high
 * enough to see the spiral, low enough to see the disc's thickness.
 */
export function galaxyCamera(
  mapId: string,
  settings: ResolvedGalaxySettings,
  objects: readonly Pick<ViewObject, 'id' | 'position'>[] = [],
): ViewCameraConfig {
  const radius = settings.radiusLy;
  const distance = GALAXY_START_DISTANCE_RADII * radius;
  const tilt = GALAXY_START_TILT_DEG * DEG;
  const across = GALAXY_DISC_EXTENT_RADII * radius;
  const height = GALAXY_TARGET_HEIGHT_RADII * radius;
  const frameNeighbors = {
    count: FLY_TO_NEIGHBOR_COUNT,
    minCount: FLY_TO_NEIGHBOR_MIN_COUNT,
    gap: FLY_TO_NEIGHBOR_GAP,
    padding: FLY_TO_NEIGHBORHOOD_PADDING,
    maxRadius: FLY_TO_MAX_NEIGHBORHOOD_LY,
  };
  return {
    key: `${mapId}:${radius.toString()}`,
    near: GALAXY_NEAR_RADII * radius,
    far: GALAXY_FAR_RADII * radius,
    clipping: {
      nearFraction: GALAXY_NEAR_FRACTION,
      minNear: GALAXY_MIN_NEAR_LY,
      farBeyond: GALAXY_FAR_BEYOND_RADII * radius,
    },
    minDistance: GALAXY_MIN_DISTANCE_LY,
    maxDistance: GALAXY_MAX_DISTANCE_RADII * radius,
    minPolarAngle: POLAR_MIN_DEG * DEG,
    maxPolarAngle: POLAR_MAX_DEG * DEG,
    targetBounds: { min: [-across, -height, -across], max: [across, height, across] },
    // +Y is galactic north (data-model §5): up by cos(tilt), toward the viewer by sin(tilt).
    position: [0, distance * Math.cos(tilt), distance * Math.sin(tilt)],
    target: [0, 0, 0],
    frameMinRadius: FLY_TO_MIN_RADIUS_LY,
    frameNeighbors,
    // After leaving a system opened from a link: look down at it at the start tilt, framing its
    // neighborhood as flying to it would (D-61). The window's shape stands in for the canvas's,
    // which fills it.
    focusPose: (objectId) => {
      const object = objects.find((item) => item.id === objectId);
      if (!object) return null;
      const [x, y, z] = object.position;
      const others = objects.filter((item) => item.id !== objectId).map((item) => item.position);
      const frameRadiusLy = Math.max(
        FLY_TO_MIN_RADIUS_LY,
        neighborhoodRadius(object.position, others, frameNeighbors),
      );
      const away = Math.max(
        GALAXY_MIN_DISTANCE_LY,
        distanceToFit(frameRadiusLy, CAMERA_FOV_DEG, window.innerWidth / window.innerHeight),
      );
      return {
        position: [x, y + away * Math.cos(tilt), z + away * Math.sin(tilt)],
        target: [x, y, z],
      };
    },
  };
}
