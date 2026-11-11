import type { Satellite, ViewObject } from '@ge/domain';
import { SYSTEM_SATELLITE_SPREAD } from '../tuning.ts';

/**
 * A system view's moons and stations beside their planets (rendering.md §7): each satellite
 * as the system view draws it, around its planet at system scale. In the orbit view a
 * satellite's position and size are in its planet's radii; here one planet radius is the
 * planet's system-view radius (`size`, in su), so a moon 3 radii out sits 3 drawn radii from
 * its planet, as in the orbit view, only smaller. SYSTEM_SATELLITE_SPREAD stretches that if
 * moons crowd their planet.
 *
 * Their positions belong to their planet's frame, so the system view never moves them: they
 * aren't among the view's objects for editing (levels/registry.ts `objectsIn`).
 */
export function placeSatellites(
  children: readonly ViewObject[],
  satellites: readonly Satellite[],
): ViewObject[] {
  const planets = new Map<string, ViewObject>(children.map((child) => [child.id, child]));
  return satellites.flatMap((satellite): ViewObject[] => {
    const planet = planets.get(satellite.parentId);
    const radiusSu = planet?.size;
    if (!planet || radiusSu === null || radiusSu === undefined) return [];
    const scale = radiusSu * SYSTEM_SATELLITE_SPREAD;
    const [px, py, pz] = planet.position;
    const [x, y, z] = satellite.position;
    return [
      {
        ...satellite,
        position: [px + x * scale, py + y * scale, pz + z * scale],
        size: satellite.size === null ? null : satellite.size * radiusSu,
      },
    ];
  });
}
