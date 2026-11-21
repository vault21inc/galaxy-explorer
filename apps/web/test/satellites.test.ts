import { describe, expect, it } from 'vitest';
import { placeSatellites } from '@/render/system/satellites.ts';
import { viewObject } from './view-fixtures.ts';

/** Moons and stations beside their planets in the system view. */

describe('placeSatellites', () => {
  it('puts each satellite around its planet, in the planet’s system-view radii', () => {
    const planet = viewObject('p', 'planet', { position: [10, 0, -4], size: 0.25 });
    const moon = { ...viewObject('m', 'moon', { position: [3, 0, 1], size: 0.27 }), parentId: 'p' };
    const [placed] = placeSatellites([planet], [moon as never]);
    expect(placed?.position).toEqual([10 + 3 * 0.25, 0, -4 + 1 * 0.25]);
    expect(placed?.size).toBeCloseTo(0.27 * 0.25, 12);
  });

  it('turns them with the planet’s axial tilt, into the plane of its equator (D-60)', () => {
    const planet = viewObject('p', 'planet', {
      position: [10, 0, 0],
      size: 0.5,
      appearance: { color: '#e3cf98', planet: { axialTiltDeg: 90 } },
    });
    const moon = { ...viewObject('m', 'moon', { position: [0, 0, 2], size: 0.27 }), parentId: 'p' };
    const [placed] = placeSatellites([planet], [moon as never]);
    // A quarter turn about x takes the equator's +z to −y: the moon hangs below the planet.
    expect(placed?.position[0]).toBeCloseTo(10, 12);
    expect(placed?.position[1]).toBeCloseTo(-1, 12);
    expect(placed?.position[2]).toBeCloseTo(0, 12);
  });

  it('leaves out satellites whose planet isn’t drawn', () => {
    const moon = { ...viewObject('m', 'moon', { position: [3, 0, 0], size: 0.27 }), parentId: 'x' };
    expect(placeSatellites([], [moon as never])).toEqual([]);
  });
});
