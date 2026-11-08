import type { ResolvedGalaxySettings } from '@ge/domain';
import type { ViewCameraConfig } from '../camera/use-view-camera.ts';
import {
  GALAXY_FAR_RADII,
  GALAXY_MAX_DISTANCE_RADII,
  GALAXY_MIN_DISTANCE_LY,
  GALAXY_NEAR_RADII,
  GALAXY_START_DISTANCE_RADII,
  GALAXY_START_TILT_DEG,
  POLAR_MAX_DEG,
  POLAR_MIN_DEG,
} from '../tuning.ts';

const DEG = Math.PI / 180;

/**
 * The galaxy view's camera (rendering.md §5), in light-years. It starts looking at the center
 * from GALAXY_START_DISTANCE_RADII away, tilted GALAXY_START_TILT_DEG from straight down: high
 * enough to see the spiral, low enough to see the disc's thickness.
 */
export function galaxyCamera(mapId: string, settings: ResolvedGalaxySettings): ViewCameraConfig {
  const radius = settings.radiusLy;
  const distance = GALAXY_START_DISTANCE_RADII * radius;
  const tilt = GALAXY_START_TILT_DEG * DEG;
  return {
    key: `${mapId}:${radius.toString()}`,
    near: GALAXY_NEAR_RADII * radius,
    far: GALAXY_FAR_RADII * radius,
    minDistance: GALAXY_MIN_DISTANCE_LY,
    maxDistance: GALAXY_MAX_DISTANCE_RADII * radius,
    minPolarAngle: POLAR_MIN_DEG * DEG,
    maxPolarAngle: POLAR_MAX_DEG * DEG,
    // +Y is galactic north (data-model §5): up by cos(tilt), toward the viewer by sin(tilt).
    position: [0, distance * Math.cos(tilt), distance * Math.sin(tilt)],
    target: [0, 0, 0],
  };
}
