import { PerspectiveCamera, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultName, placeableTypes } from '../src/editor/placeable-types.ts';
import { workPlanePoint } from '../src/editor/work-plane.ts';

describe('placeableTypes', () => {
  it('offers in the galaxy view the types whose parents include the map', () => {
    expect(placeableTypes('galaxy').sort()).toEqual(
      ['anomaly', 'black_hole', 'marker', 'nebula', 'planet', 'station', 'system'].sort(),
    );
  });

  it('offers inside a system the types a system can hold', () => {
    expect(placeableTypes('system')).toEqual(
      expect.arrayContaining(['star', 'planet', 'asteroid_belt', 'station']),
    );
    expect(placeableTypes('system')).not.toContain('system');
  });

  it('names a new object after its type', () => {
    expect(defaultName('black_hole')).toBe('New black hole');
  });
});

describe('workPlanePoint', () => {
  const camera = new PerspectiveCamera(45, 1.6, 1, 1_000_000);
  camera.position.set(0, 1_000, 1_000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  it('puts the center of the view where the camera looks on the plane', () => {
    const point = workPlanePoint(camera, new Vector2(0, 0));
    expect(point?.[0]).toBeCloseTo(0, 6);
    expect(point?.[1]).toBe(0);
    expect(point?.[2]).toBeCloseTo(0, 3);
  });

  it('lands on y = 0 elsewhere in the view too', () => {
    const point = workPlanePoint(camera, new Vector2(0.5, -0.3));
    expect(point?.[1]).toBe(0);
    expect(point?.[0]).toBeGreaterThan(0);
  });

  it('finds nothing when the pointer is above the horizon', () => {
    const level = new PerspectiveCamera(45, 1.6, 1, 1_000_000);
    level.position.set(0, 100, 0);
    level.lookAt(0, 100, -1);
    level.updateMatrixWorld();
    expect(workPlanePoint(level, new Vector2(0, 0.5))).toBeNull();
  });
});
