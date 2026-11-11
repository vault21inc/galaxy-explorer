import { describe, expect, it } from 'vitest';
import {
  greatCircleDistanceRad,
  latLonToUnitVector,
  latLonToUv,
  normalizeLonDeg,
  raySphereIntersect,
  slerpLatLon,
  unitVectorToLatLon,
  uvToLatLon,
  type LatLon,
} from '../src/index.ts';

/** Surface coordinates (M6-T1, data-model §5). */

const closeVec = (actual: readonly number[], expected: readonly number[], digits = 12) => {
  actual.forEach((value, axis) => {
    expect(value).toBeCloseTo(expected[axis] ?? Number.NaN, digits);
  });
};
const closeLatLon = (actual: LatLon, expected: LatLon, digits = 9) => {
  expect(actual.latDeg).toBeCloseTo(expected.latDeg, digits);
  // Compared around the circle, so −180 and 180 are the same longitude.
  const difference = normalizeLonDeg(actual.lonDeg - expected.lonDeg);
  expect(Math.abs(difference)).toBeLessThan(10 ** -digits);
};

describe('lat/lon and directions', () => {
  it('puts lon 0 on +X, east (+90) on −Z, west on +Z, and the poles on ±Y', () => {
    closeVec(latLonToUnitVector({ latDeg: 0, lonDeg: 0 }), [1, 0, 0]);
    closeVec(latLonToUnitVector({ latDeg: 0, lonDeg: 90 }), [0, 0, -1]);
    closeVec(latLonToUnitVector({ latDeg: 0, lonDeg: -90 }), [0, 0, 1]);
    closeVec(latLonToUnitVector({ latDeg: 0, lonDeg: -180 }), [-1, 0, 0]);
    closeVec(latLonToUnitVector({ latDeg: 90, lonDeg: 37 }), [0, 1, 0]);
    closeVec(latLonToUnitVector({ latDeg: -90, lonDeg: -120 }), [0, -1, 0]);
  });

  it('round-trips everywhere off the poles, including the antimeridian', () => {
    for (let latDeg = -89; latDeg <= 89; latDeg += 7) {
      for (let lonDeg = -180; lonDeg < 180; lonDeg += 11) {
        closeLatLon(unitVectorToLatLon(latLonToUnitVector({ latDeg, lonDeg })), { latDeg, lonDeg });
      }
    }
    // Just either side of ±180 stays on its own side.
    closeLatLon(unitVectorToLatLon(latLonToUnitVector({ latDeg: 10, lonDeg: 179.999 })), {
      latDeg: 10,
      lonDeg: 179.999,
    });
    closeLatLon(unitVectorToLatLon(latLonToUnitVector({ latDeg: 10, lonDeg: -179.999 })), {
      latDeg: 10,
      lonDeg: -179.999,
    });
  });

  it('reports the poles with longitude 0, and longitudes in [−180, 180)', () => {
    expect(unitVectorToLatLon([0, 5, 0])).toEqual({ latDeg: 90, lonDeg: 0 });
    expect(unitVectorToLatLon([0, -2, 0])).toEqual({ latDeg: -90, lonDeg: 0 });
    expect(unitVectorToLatLon([-1, 0, 0]).lonDeg).toBe(-180);
    expect(normalizeLonDeg(180)).toBe(-180);
    expect(normalizeLonDeg(540)).toBe(-180);
    expect(normalizeLonDeg(-190)).toBe(170);
    // Any length points the same way.
    closeLatLon(unitVectorToLatLon([3, 3, 0]), { latDeg: 45, lonDeg: 0 });
  });
});

describe('lat/lon and texture coordinates', () => {
  it('maps the texture as SphereGeometry does: u = 0.5 at lon 0, v = 1 at the north pole', () => {
    expect(latLonToUv({ latDeg: 0, lonDeg: 0 })).toEqual({ u: 0.5, v: 0.5 });
    expect(latLonToUv({ latDeg: 90, lonDeg: -180 })).toEqual({ u: 0, v: 1 });
    expect(latLonToUv({ latDeg: -90, lonDeg: 90 })).toEqual({ u: 0.75, v: 0 });
    expect(uvToLatLon(0, 0.5)).toEqual({ latDeg: 0, lonDeg: -180 });
    // u = 1 is the same meridian as u = 0.
    expect(uvToLatLon(1, 0.5)).toEqual({ latDeg: 0, lonDeg: -180 });
  });

  it('round-trips', () => {
    for (let u = 0; u < 1; u += 0.0625) {
      for (let v = 0; v <= 1; v += 0.125) {
        const { u: u2, v: v2 } = latLonToUv(uvToLatLon(u, v));
        expect(u2).toBeCloseTo(u, 12);
        expect(v2).toBeCloseTo(v, 12);
      }
    }
  });
});

describe('rays and the sphere', () => {
  it('hits the near side from outside', () => {
    closeVec(raySphereIntersect([5, 0, 0], [-1, 0, 0], 1) ?? [], [1, 0, 0]);
    // A direction of any length, at an angle.
    const hit = raySphereIntersect([0, 3, 3], [0, -2, -2], 1);
    closeVec(hit ?? [], [0, Math.SQRT1_2, Math.SQRT1_2]);
  });

  it('grazes at the edge, and misses past it or when the sphere is behind', () => {
    closeVec(raySphereIntersect([5, 1, 0], [-1, 0, 0], 1) ?? [], [0, 1, 0]);
    expect(raySphereIntersect([5, 1.0001, 0], [-1, 0, 0], 1)).toBeNull();
    expect(raySphereIntersect([5, 0, 0], [1, 0, 0], 1)).toBeNull();
    expect(raySphereIntersect([5, 0, 0], [0, 0, 0], 1)).toBeNull();
  });

  it('from inside, meets the sphere on the way out', () => {
    closeVec(raySphereIntersect([0, 0, 0], [0, 0, 1], 2) ?? [], [0, 0, 2]);
  });

  it('hits where the lat/lon says, so a clicked point maps back to itself', () => {
    const target = latLonToUnitVector({ latDeg: 35, lonDeg: -120 });
    const camera = [target[0] * 4, target[1] * 4, target[2] * 4] as const;
    const hit = raySphereIntersect(camera, [-target[0], -target[1], -target[2]], 1);
    closeLatLon(unitVectorToLatLon(hit ?? [0, 0, 0]), { latDeg: 35, lonDeg: -120 });
  });
});

describe('distances and paths on the surface', () => {
  it('measures great-circle distances in radians', () => {
    const origin = { latDeg: 0, lonDeg: 0 };
    expect(greatCircleDistanceRad(origin, { latDeg: 0, lonDeg: 90 })).toBeCloseTo(Math.PI / 2, 12);
    expect(greatCircleDistanceRad(origin, { latDeg: 90, lonDeg: 0 })).toBeCloseTo(Math.PI / 2, 12);
    expect(greatCircleDistanceRad(origin, { latDeg: 0, lonDeg: -180 })).toBeCloseTo(Math.PI, 12);
    // Across the antimeridian, the short way: 2° apart, not 358°.
    expect(
      greatCircleDistanceRad({ latDeg: 0, lonDeg: 179 }, { latDeg: 0, lonDeg: -179 }),
    ).toBeCloseTo((2 * Math.PI) / 180, 12);
    // Tiny distances stay accurate.
    expect(greatCircleDistanceRad(origin, { latDeg: 0, lonDeg: 1e-7 })).toBeCloseTo(
      (1e-7 * Math.PI) / 180,
      18,
    );
  });

  it('slerps along the great circle at an even pace, the short way round', () => {
    const a = { latDeg: 0, lonDeg: 0 };
    const b = { latDeg: 0, lonDeg: 90 };
    closeLatLon(slerpLatLon(a, b, 0), a);
    closeLatLon(slerpLatLon(a, b, 1), b);
    closeLatLon(slerpLatLon(a, b, 0.5), { latDeg: 0, lonDeg: 45 });
    closeLatLon(slerpLatLon(a, b, 0.25), { latDeg: 0, lonDeg: 22.5 });
    // Across the antimeridian it goes through ±180, not back across lon 0.
    closeLatLon(slerpLatLon({ latDeg: 0, lonDeg: 170 }, { latDeg: 0, lonDeg: -170 }, 0.5), {
      latDeg: 0,
      lonDeg: -180,
    });
    // Each step covers the same angle.
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) =>
      slerpLatLon({ latDeg: 10, lonDeg: 20 }, { latDeg: -30, lonDeg: 120 }, t),
    );
    const gaps = steps.slice(1).map((point, i) => greatCircleDistanceRad(steps[i] ?? point, point));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? Number.NaN, 9);
  });

  it('goes over the nearer pole between opposite points', () => {
    const a = { latDeg: 30, lonDeg: 0 };
    const b = { latDeg: -30, lonDeg: -180 };
    closeLatLon(slerpLatLon(a, b, 1), b);
    // A third of the way: 60° along, past the north pole at 60°.
    const third = slerpLatLon(a, b, 1 / 3);
    expect(third.latDeg).toBeCloseTo(90, 6);
    expect(greatCircleDistanceRad(a, slerpLatLon(a, b, 0.5))).toBeCloseTo(Math.PI / 2, 9);
  });
});
