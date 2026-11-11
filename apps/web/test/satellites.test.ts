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

  it('leaves out satellites whose planet isn’t drawn', () => {
    const moon = { ...viewObject('m', 'moon', { position: [3, 0, 0], size: 0.27 }), parentId: 'x' };
    expect(placeSatellites([], [moon as never])).toEqual([]);
  });
});
