import { describe, expect, it } from 'vitest';
import {
  axialTiltRad,
  equatorToView,
  objectsInView,
  orbitPayloadInView,
  poleInView,
  viewToEquator,
} from '@/render/orbits/equator-frame.ts';
import { viewObject } from './view-fixtures.ts';

/** A planet's equatorial frame: what orbits it, turned by its axial tilt (D-60). */

const DEG = Math.PI / 180;

describe('equatorToView', () => {
  it('leans the pole from +Y toward +Z, as the globe is tilted', () => {
    const [x, y, z] = poleInView(30 * DEG);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(Math.cos(30 * DEG), 12);
    expect(z).toBeCloseTo(Math.sin(30 * DEG), 12);
  });

  it('keeps a point on the x axis, which the tilt turns about', () => {
    expect(equatorToView([3, 0, 0], 40 * DEG)).toEqual([3, 0, 0]);
  });

  it('lifts a point on the equator out of the flat plane', () => {
    const [, y, z] = equatorToView([0, 0, 2], 90 * DEG);
    expect(y).toBeCloseTo(-2, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it('turns back exactly', () => {
    const point: [number, number, number] = [1.5, -0.3, 2.7];
    const back = viewToEquator(equatorToView(point, 26.7 * DEG), 26.7 * DEG);
    back.forEach((value, i) => {
      expect(value).toBeCloseTo(point[i] ?? NaN, 12);
    });
  });

  it('changes nothing for an untilted planet', () => {
    expect(equatorToView([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

describe('the orbit view payload', () => {
  const tilted = viewObject('saturn', 'planet', {
    appearance: { color: '#e3cf98', planet: { axialTiltDeg: 26.7 } },
  });

  it('reads the tilt from the planet’s appearance, 0 when it has none', () => {
    expect(axialTiltRad(tilted.appearance)).toBeCloseTo(26.7 * DEG, 12);
    expect(axialTiltRad(viewObject('flat', 'planet').appearance)).toBe(0);
  });

  it('turns what orbits the planet, and nothing else', () => {
    const moon = viewObject('enceladus', 'moon', { position: [0, 0, 2.5] });
    const [drawn] = objectsInView([moon], axialTiltRad(tilted.appearance));
    expect(drawn?.position[1]).toBeCloseTo(-2.5 * Math.sin(26.7 * DEG), 12);
    expect(moon.position).toEqual([0, 0, 2.5]);
  });

  it('leaves an untilted planet’s payload as it is', () => {
    const payload = { subject: viewObject('earth', 'planet'), children: [] } as never;
    expect(orbitPayloadInView(payload)).toBe(payload);
  });
});
