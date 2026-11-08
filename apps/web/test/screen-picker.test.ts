import { resolveGalaxySettings, sampleGalaxyPosition, seededRandom } from '@ge/domain/galaxy';
import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { ScreenPicker } from '../src/render/picking/screen-picker.ts';
import type { DrawnObject } from '../src/render/scene-index.ts';
import { worldPerPxAt1 } from '../src/render/screen-scale.ts';
import { PICK_MIN_RADIUS_PX } from '../src/render/tuning.ts';

const WIDTH = 1_440;
const HEIGHT = 900;

/** A camera 110,000 ly out, tilted 50° from straight down: the galaxy view's start (tuning.ts). */
function galaxyCamera() {
  const camera = new PerspectiveCamera(45, WIDTH / HEIGHT, 50, 400_000);
  const tilt = (50 * Math.PI) / 180;
  camera.position.set(0, 110_000 * Math.cos(tilt), 110_000 * Math.sin(tilt));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const viewport = {
    widthPx: WIDTH,
    heightPx: HEIGHT,
    worldPerPxAt1: worldPerPxAt1(camera, HEIGHT),
  };
  return { viewProjection: viewProjection.elements, viewport };
}

const body = (id: string, center: [number, number, number], radius = 120): DrawnObject => ({
  id,
  renderer: 'instanced-bodies',
  center,
  radius,
  minRadiusPx: 4,
  maxRadiusPx: 20,
  state: 'normal',
  color: '#ffffff',
  pickPriority: 1,
  label: id,
  labelPriority: 0,
});

const region = (id: string, center: [number, number, number], radius: number): DrawnObject => ({
  ...body(id, center, radius),
  renderer: 'region-cloud',
  minRadiusPx: 3,
  maxRadiusPx: 320,
  pickPriority: 0,
});

describe('ScreenPicker', () => {
  const { viewProjection, viewport } = galaxyCamera();

  function built(objects: DrawnObject[]) {
    const picker = new ScreenPicker();
    picker.rebuild(objects, viewProjection, viewport);
    return picker;
  }

  it('picks an object at its projected center, and nothing far from it', () => {
    const picker = built([body('center', [0, 0, 0])]);
    const circle = picker.screenCircleOf('center');
    expect(circle?.x).toBeCloseTo(WIDTH / 2, 0);
    expect(circle?.y).toBeCloseTo(HEIGHT / 2, 0);
    expect(picker.pick(WIDTH / 2 + 3, HEIGHT / 2 - 3)?.id).toBe('center');
    expect(picker.pick(WIDTH / 2 + 40, HEIGHT / 2)).toBeNull();
  });

  it('never makes a pick circle smaller than the minimum', () => {
    const picker = built([body('tiny', [0, 0, 0], 1)]);
    expect(picker.screenCircleOf('tiny')?.radiusPx).toBe(PICK_MIN_RADIUS_PX);
    expect(picker.pick(WIDTH / 2 + PICK_MIN_RADIUS_PX - 1, HEIGHT / 2)?.id).toBe('tiny');
  });

  it('prefers a body over the region it sits in, then the nearer center', () => {
    const picker = built([
      region('nebula', [0, 0, 0], 8_000),
      body('a', [0, 0, 0]),
      body('b', [600, 0, 0]),
    ]);
    const a = picker.screenCircleOf('a');
    const b = picker.screenCircleOf('b');
    if (!a || !b) throw new Error('Both bodies should project.');
    expect(picker.pick(a.x, a.y)?.id).toBe('a');
    expect(picker.pick(b.x, b.y)?.id).toBe('b');
    // Inside the nebula but away from both bodies: the nebula.
    expect(picker.pick(a.x, a.y + 60)?.id).toBe('nebula');
  });

  it('leaves out objects behind the camera or off screen', () => {
    const picker = built([
      body('behind', [0, 300_000, 300_000]),
      body('far-off', [10_000_000, 0, 0]),
    ]);
    expect(picker.size).toBe(0);
  });

  it('finds objects inside a rectangle by their centers', () => {
    const picker = built([body('center', [0, 0, 0]), body('east', [40_000, 0, 0])]);
    const hits = picker.pickRect({
      left: WIDTH / 2 - 5,
      top: HEIGHT / 2 - 5,
      right: WIDTH / 2 + 5,
      bottom: HEIGHT / 2 + 5,
    });
    expect(hits.map((hit) => hit.id)).toEqual(['center']);
  });

  it('picks among 5,000 objects in well under 1 ms per pointer move', () => {
    // The stress map's shape: 5,000 objects sampled from the galaxy density, 2 % regions.
    const settings = resolveGalaxySettings({ seed: 40_000, radiusLy: 60_000 });
    const random = seededRandom(1);
    const objects = Array.from({ length: 5_000 }, (_, i) => {
      const position = sampleGalaxyPosition(settings, random);
      return i % 50 === 0
        ? region(`r${i.toString()}`, position, 1_500)
        : body(`b${i.toString()}`, position);
    });
    const picker = new ScreenPicker();

    const rebuildStart = performance.now();
    const rebuilds = 20;
    for (let i = 0; i < rebuilds; i++) picker.rebuild(objects, viewProjection, viewport);
    const rebuildMs = (performance.now() - rebuildStart) / rebuilds;

    const picks = 20_000;
    const points = Array.from(
      { length: picks },
      () => [random() * WIDTH, random() * HEIGHT] as const,
    );
    const pickStart = performance.now();
    let found = 0;
    for (const [x, y] of points) if (picker.pick(x, y)) found++;
    const pickMs = (performance.now() - pickStart) / picks;

    console.log(
      `ScreenPicker, 5,000 objects: rebuild ${rebuildMs.toFixed(2)} ms, pick ${(pickMs * 1_000).toFixed(2)} µs (${found.toString()} of ${picks.toString()} picks hit)`,
    );
    expect(pickMs).toBeLessThan(1);
    expect(found).toBeGreaterThan(0);
  });
});
