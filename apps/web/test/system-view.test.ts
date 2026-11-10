import { HIDE_SPOILERS, SHOW_SPOILERS } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { buildBeltRocks } from '../src/render/belts/belt-rocks.ts';
import { hexToLinear } from '../src/render/color.ts';
import { orbitRings, writeOrbitRings } from '../src/render/orbits/orbit-shapes.ts';
import {
  BELT_HALF_WIDTH_SIZES,
  BELT_ROCKS,
  ORBIT_RING_COLOR,
  ORBIT_RING_SEGMENTS,
  ORBIT_RING_SELECTED_COLOR,
  REDACTION_COLOR,
} from '../src/render/tuning.ts';
import { viewObject } from './view-fixtures.ts';

/** The system view's pure parts (M5-T3, rendering.md §7): belts and orbit rings. */

describe('asteroid belts', () => {
  const belt = viewObject('belt-1', 'asteroid_belt', {
    position: [6, 0, 8],
    size: 1,
    appearance: { color: '#a39380' },
  });

  it('scatters the same rocks every time, in a band through the belt’s position', () => {
    const rocks = buildBeltRocks([belt], SHOW_SPOILERS, 'asteroid-belts');
    expect(rocks.count).toBe(BELT_ROCKS);
    expect(buildBeltRocks([belt], SHOW_SPOILERS, 'asteroid-belts').centers).toEqual(rocks.centers);
    const distances = Array.from({ length: rocks.count }, (_, i) =>
      Math.hypot(rocks.centers[i * 3] ?? 0, rocks.centers[i * 3 + 2] ?? 0),
    );
    const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    expect(mean).toBeCloseTo(10, 1);
    // Bell-shaped across the band: nearly all within its half-width of the middle.
    const inside = distances.filter((d) => Math.abs(d - 10) <= BELT_HALF_WIDTH_SIZES).length;
    expect(inside / distances.length).toBeGreaterThan(0.9);
  });

  it('is picked along its middle circle, below the bodies inside it', () => {
    const [drawn] = buildBeltRocks([belt], SHOW_SPOILERS, 'asteroid-belts').drawn;
    expect(drawn?.pickPriority).toBeLessThan(1);
    for (const [x, , z] of drawn?.curve ?? []) expect(Math.hypot(x, z)).toBeCloseTo(10);
  });

  it('keeps a hidden spoiler belt’s color to itself', () => {
    const secret = viewObject('belt-2', 'asteroid_belt', {
      position: [3, 0, 0],
      size: 1,
      isSpoiler: true,
      appearance: { color: '#ff0000' },
    });
    const rocks = buildBeltRocks([secret], HIDE_SPOILERS, 'asteroid-belts');
    expect(rocks.drawn[0]?.state).toBe('redacted');
    // Red is gone: the rocks are the redaction color, only lighter or darker.
    const [r, , b] = hexToLinear(REDACTION_COLOR);
    expect((rocks.colors[0] ?? 0) / (rocks.colors[2] ?? 1)).toBeCloseTo(r / b);
  });
});

describe('orbit rings', () => {
  const planet = (id: string, position: [number, number, number], showOrbit = true) =>
    viewObject(id, 'planet', { position, size: 0.25, appearance: { color: '#7fa7ff', showOrbit } });

  it('circle the center through each body that shows its orbit', () => {
    const rings = orbitRings(
      [planet('a', [3, 0, 4]), planet('b', [1, 0, 0], false), planet('c', [0, 0, 0])],
      SHOW_SPOILERS,
    );
    expect(rings.map((ring) => ring.id)).toEqual(['a']);
    const positions = new Float32Array(ORBIT_RING_SEGMENTS * 6);
    const colors = new Float32Array(ORBIT_RING_SEGMENTS * 6);
    writeOrbitRings(rings, positions, colors, new Set(), null);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i] ?? 0, positions[i + 2] ?? 0)).toBeCloseTo(5);
    }
    expect([...colors.slice(0, 3)]).toEqual(hexToLinear(ORBIT_RING_COLOR).map(Math.fround));
  });

  it('light up for the selection and follow a dragged body', () => {
    const rings = orbitRings([planet('a', [3, 0, 4])], SHOW_SPOILERS);
    const positions = new Float32Array(ORBIT_RING_SEGMENTS * 6);
    const colors = new Float32Array(ORBIT_RING_SEGMENTS * 6);
    writeOrbitRings(rings, positions, colors, new Set(['a']), {
      ids: new Set(['a']),
      delta: [3, 0, 4],
    });
    expect(Math.hypot(positions[0] ?? 0, positions[2] ?? 0)).toBeCloseTo(10);
    expect([...colors.slice(0, 3)]).toEqual(
      hexToLinear(ORBIT_RING_SELECTED_COLOR).map(Math.fround),
    );
  });
});
