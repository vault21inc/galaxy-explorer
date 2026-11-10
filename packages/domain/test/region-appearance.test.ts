import { describe, expect, it } from 'vitest';
import { objectTypes } from '../src/registry/object-types.ts';
import { RegionAppearance } from '../src/schemas/appearance.ts';

/** The region schema per shape (M4-T6, D-25). */

const ok = (value: unknown) => RegionAppearance.safeParse(value).success;

describe('RegionAppearance', () => {
  it('takes the four shapes and nothing else', () => {
    for (const shape of ['sphere', 'disc', 'storm', 'rift']) expect(ok({ shape })).toBe(true);
    expect(ok({ shape: 'vortex' })).toBe(false);
  });

  it('takes a storm with a darker core, a rim, filaments and up to four gaps', () => {
    const storm = {
      shape: 'storm',
      radius: 4_000,
      innerRadius: 0.5,
      rimColor: '#ffb3cf',
      filaments: 0.7,
      gaps: [{ angleDeg: 200, widthDeg: 25 }],
      texture: 'upload',
      rotationDeg: 30,
    };
    expect(ok(storm)).toBe(true);
    expect(ok({ ...storm, innerRadius: 0.95 })).toBe(false);
    expect(ok({ ...storm, filaments: 1.5 })).toBe(false);
    expect(ok({ ...storm, gaps: [{ angleDeg: 0, widthDeg: 0 }] })).toBe(false);
    const fiveGaps = Array.from({ length: 5 }, (_, i) => ({ angleDeg: i * 60, widthDeg: 10 }));
    expect(ok({ ...storm, gaps: fiveGaps })).toBe(false);
    expect(ok({ ...storm, texture: 'painted' })).toBe(false);
  });

  it('takes a rift path of 2 to 64 points', () => {
    const point = (i: number) => [i * 1_000, 0] as const;
    expect(ok({ shape: 'rift', path: [point(0), point(1)] })).toBe(true);
    expect(ok({ shape: 'rift', path: [point(0)] })).toBe(false);
    expect(ok({ shape: 'rift', path: Array.from({ length: 65 }, (_, i) => point(i)) })).toBe(false);
    expect(ok({ shape: 'rift', path: [[0, 0, 0], point(1)] })).toBe(false);
  });

  it('gives both region types valid defaults for every shape', () => {
    for (const type of [objectTypes.nebula, objectTypes.anomaly]) {
      expect(ok(type.defaultAppearance.region)).toBe(true);
    }
  });
});
