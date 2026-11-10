import { resolveGalaxySettings } from '@ge/domain';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { GALAXY_MAX_DISTANCE_RADII } from '@/render/tuning.ts';

/**
 * How far from the galaxy's center a drag or a placement may reach, in light-years: as far as
 * the camera itself may go (GALAXY_MAX_DISTANCE_RADII radii), so nothing lands where it can't
 * be seen again (work-plane.ts).
 */
export function useWorkPlaneLimit(mapId: string): number {
  const view = useViewPayload('galaxy', mapId, useReadOptions());
  const radiusLy = resolveGalaxySettings(view.data?.map.galaxySettings ?? {}).radiusLy;
  return GALAXY_MAX_DISTANCE_RADII * radiusLy;
}
