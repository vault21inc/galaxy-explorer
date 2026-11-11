import { latLonToUnitVector, latLonToUv, unitVectorToLatLon, uvToLatLon } from '@ge/domain';
import { SphereGeometry } from 'three';
import { describe, expect, it } from 'vitest';

/**
 * @ge/domain's surface coordinates (geo/latlon.ts) agree with three.js's `SphereGeometry`, which
 * the globe is drawn with (M6-T1): every vertex sits where its texture coordinate says it
 * should, so a pin placed at a lat/lon lands on the texel the planet texture puts there.
 *
 * Positions are compared on the unit sphere rather than in degrees: three stores them as 32-bit
 * floats, far finer than 1e-6 there, while near the poles a tiny step is many degrees of
 * longitude.
 */
describe('lat/lon matches SphereGeometry', () => {
  const sphere = new SphereGeometry(1, 64, 32);
  const position = sphere.getAttribute('position');
  const uv = sphere.getAttribute('uv');

  it('puts every vertex of a 64 × 32 sphere at its UV’s lat/lon, within 1e-6', () => {
    let worst = 0;
    for (let i = 0; i < position.count; i++) {
      const expected = latLonToUnitVector(uvToLatLon(uv.getX(i), uv.getY(i)));
      const actual = [position.getX(i), position.getY(i), position.getZ(i)];
      const error = Math.hypot(...actual.map((value, axis) => value - (expected[axis] ?? 0)));
      worst = Math.max(worst, error);
    }
    expect(position.count).toBe(65 * 33);
    expect(worst).toBeLessThan(1e-6);
  });

  it('gives back each vertex’s UV from its position, away from the poles and the seam', () => {
    for (let i = 0; i < position.count; i++) {
      const [u, v] = [uv.getX(i), uv.getY(i)];
      // At the poles every u is the same point, and u = 1 is the same meridian as u = 0.
      if (v <= 0 || v >= 1 || u >= 1) continue;
      const back = latLonToUv(
        unitVectorToLatLon([position.getX(i), position.getY(i), position.getZ(i)]),
      );
      expect(back.u).toBeCloseTo(u, 6);
      expect(back.v).toBeCloseTo(v, 6);
    }
  });
});
