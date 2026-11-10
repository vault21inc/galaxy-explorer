import { HIDE_SPOILERS, rt, type ViewObject } from '@ge/domain';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { addRiftPoint, moveRiftPoint, removeRiftPoint } from '../src/editor/rift-points.ts';
import { ScreenPicker } from '../src/render/picking/screen-picker.ts';
import { buildRegionBuffers } from '../src/render/regions/region-buffers.ts';
import {
  bakeStormPixels,
  stormBakeKey,
  type StormParams,
} from '../src/render/regions/storm-bake.ts';
import type { DrawnObject } from '../src/render/scene-index.ts';
import { worldPerPxAt1 } from '../src/render/screen-scale.ts';
import { STORM_BILLBOARDS } from '../src/render/tuning.ts';

/** Region shapes (M4-T6): the storm bake, billboards per shape, rift picking and editing. */

const STORM: StormParams = {
  innerRadius: 0.4,
  color: '#5a1030',
  rimColor: '#ff6fb0',
  filaments: 0.6,
  gaps: [],
  seed: 7,
};

describe('the storm bake', () => {
  it('keys on everything that changes the pixels', () => {
    expect(stormBakeKey(STORM)).toBe(stormBakeKey({ ...STORM }));
    expect(stormBakeKey({ ...STORM, innerRadius: 0.5 })).not.toBe(stormBakeKey(STORM));
    expect(stormBakeKey({ ...STORM, gaps: [{ angleDeg: 90, widthDeg: 20 }] })).not.toBe(
      stormBakeKey(STORM),
    );
    expect(stormBakeKey({ ...STORM, seed: 8 })).not.toBe(stormBakeKey(STORM));
  });

  const size = 128;
  /** The light a pixel adds: its alpha times its brightness, as what the eye sees. */
  const lightAt = (pixels: Uint8Array, r: number, angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    const i = Math.round(((r * Math.cos(a) + 1) / 2) * size - 0.5);
    const j = Math.round(((r * Math.sin(a) + 1) / 2) * size - 0.5);
    const at = (j * size + i) * 4;
    const brightness = ((pixels[at] ?? 0) + (pixels[at + 1] ?? 0) + (pixels[at + 2] ?? 0)) / 765;
    return (pixels[at + 3] ?? 0) * brightness;
  };
  /** The mean light around a ring of the disc. */
  const ringAlpha = (pixels: Uint8Array, r: number, from = 0, to = 360) => {
    let sum = 0;
    let count = 0;
    for (let angle = from; angle < to; angle += 2) {
      sum += lightAt(pixels, r, angle);
      count++;
    }
    return sum / count;
  };

  it('has a dark core inside a bright rim, and nothing outside the disc', () => {
    const pixels = bakeStormPixels(STORM, size);
    const rim = 0.4 + 0.6 * 0.3;
    expect(ringAlpha(pixels, rim)).toBeGreaterThan(2 * ringAlpha(pixels, 0.15));
    expect(pixels[3]).toBe(0); // a corner, outside the disc
  });

  it('opens a gap in the rim', () => {
    const rim = 0.4 + 0.6 * 0.3;
    const gapped = bakeStormPixels({ ...STORM, gaps: [{ angleDeg: 90, widthDeg: 40 }] }, size);
    const whole = bakeStormPixels(STORM, size);
    expect(ringAlpha(gapped, rim, 80, 100)).toBeLessThan(0.3 * ringAlpha(whole, rim, 80, 100));
    expect(ringAlpha(gapped, rim, 260, 280)).toBeCloseTo(ringAlpha(whole, rim, 260, 280), 0);
  });
});

const region = (id: string, shape: string, extra: object = {}) =>
  ({
    id,
    baseType: 'anomaly',
    name: rt.plain(id),
    namePlain: id,
    nameRedacted: id,
    nameSpoiler: false,
    isSpoiler: false,
    status: 'published',
    position: [1_000, 0, 2_000],
    appearance: { region: { shape, radius: 1_000, density: 0.5, color: '#ff4f8b', ...extra } },
  }) as unknown as ViewObject;

describe('billboards per shape', () => {
  it('puts a storm’s few billboards on its rim, and a rift’s along its curve', () => {
    const rift = region('rift', 'rift', {
      path: [
        [-6_000, 0],
        [6_000, 0],
      ],
    });
    const buffers = buildRegionBuffers(
      [region('storm', 'storm'), rift, region('cloud', 'sphere')],
      HIDE_SPOILERS,
      'region-cloud',
    );
    expect(buffers.ranges.get('storm')?.[1]).toBe(STORM_BILLBOARDS);
    const [first, count] = buffers.ranges.get('rift') ?? [0, 0];
    // 12,000 ly long at 1.2 half-widths apart: 10 billboards, all within the band.
    expect(count).toBe(10);
    for (let k = first; k < first + count; k++) {
      expect(Math.abs((buffers.centers[k * 3 + 2] ?? 0) - 2_000)).toBeLessThanOrEqual(500);
    }
    expect(buffers.drawn.map((drawn) => drawn.shape)).toEqual(['storm', 'rift', 'sphere']);
    const drawnRift = buffers.drawn[1];
    expect(drawnRift?.curve?.length).toBeGreaterThan(2);
    // Labelled and ringed at the curve's middle.
    expect(drawnRift?.center[0]).toBeCloseTo(1_000);
    expect(drawnRift?.center[2]).toBeCloseTo(2_000);
  });
});

describe('picking a rift', () => {
  it('hits it along its curve, not beside it', () => {
    const camera = new PerspectiveCamera(45, 1.6, 50, 400_000);
    camera.position.set(0, 60_000, 0.001);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const viewProjection = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ).elements;
    const viewport = {
      widthPx: 1_600,
      heightPx: 1_000,
      worldPerPxAt1: worldPerPxAt1(camera, 1_000),
    };
    const curve = Array.from({ length: 21 }, (_, i) => [-20_000 + i * 2_000, 0, 0] as const);
    const rift: DrawnObject = {
      id: 'rift',
      renderer: 'region-cloud',
      center: [0, 0, 0],
      radius: 1_000,
      minRadiusPx: 3,
      maxRadiusPx: 320,
      state: 'normal',
      color: '#ff4f8b',
      pickPriority: 0,
      label: 'Rift',
      labelPriority: 0,
      shape: 'rift',
      curve,
    };
    const picker = new ScreenPicker();
    picker.rebuild([rift], viewProjection, viewport);
    const toScreen = (x: number, z: number) => {
      const point = new Vector3(x, 0, z).project(camera);
      return [((point.x + 1) / 2) * 1_600, ((1 - point.y) / 2) * 1_000] as const;
    };
    expect(picker.pick(...toScreen(12_000, 0))?.id).toBe('rift');
    expect(picker.pick(...toScreen(12_000, 600))?.id).toBe('rift');
    // Beside the band, still inside the circle around the whole curve.
    expect(picker.pick(...toScreen(0, 8_000))).toBeNull();
  });
});

describe('editing rift points', () => {
  const path = [
    [0, 0],
    [1_000, 0],
  ] as const;
  it('adds at the nearer end, moves and removes, keeping at least two', () => {
    expect(addRiftPoint(path, [2_000, 0])).toEqual([...path, [2_000, 0]]);
    expect(addRiftPoint(path, [-500, 0])).toEqual([[-500, 0], ...path]);
    expect(moveRiftPoint(path, 1, [1_000, 300])).toEqual([
      [0, 0],
      [1_000, 300],
    ]);
    expect(removeRiftPoint(path, 0)).toBeNull();
    expect(removeRiftPoint([...path, [2_000, 0]], 1)).toEqual([
      [0, 0],
      [2_000, 0],
    ]);
  });
});
