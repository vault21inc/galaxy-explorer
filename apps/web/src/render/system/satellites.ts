import type { Satellite, ViewObject } from '@ge/domain';
import { axialTiltRad, equatorToView } from '../orbits/equator-frame.ts';
import { SYSTEM_SATELLITE_SPREAD } from '../tuning.ts';

/**
 * A system view's moons and stations beside their planets (rendering.md §7): each satellite
 * as the system view draws it, around its planet at system scale. In the orbit view a
 * satellite's position and size are in its planet's radii; here one planet radius is the
 * planet's system-view radius (`size`, in su), so a moon 3 radii out sits 3 drawn radii from
 * its planet, as in the orbit view, only smaller. SYSTEM_SATELLITE_SPREAD stretches that if
 * moons crowd their planet. Their offsets turn with the planet's axial tilt, so they circle in
 * the plane of its equator and rings, as in the orbit view (orbits/equator-frame.ts, D-60).
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
    const [x, y, z] = equatorToView(satellite.position, axialTiltRad(planet.appearance));
    return [
      {
        ...satellite,
        position: [px + x * scale, py + y * scale, pz + z * scale],
        size: satellite.size === null ? null : satellite.size * radiusSu,
      },
    ];
  });
}
