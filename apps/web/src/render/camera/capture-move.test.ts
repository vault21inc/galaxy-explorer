import { describe, expect, it } from 'vitest';
import type { CameraPose } from '@/state/navigation-stack.ts';
import { easeInOut, planMove, poseAt, type Vec3Like } from './capture-move.ts';

const OPTIONS = { spinDeg: 0, curvature: Math.SQRT2, fovDeg: 45 };

function pose(plan: ReturnType<typeof planMove>, t: number) {
  const position: Vec3Like = { x: 0, y: 0, z: 0 };
  const target: Vec3Like = { x: 0, y: 0, z: 0 };
  poseAt(plan, t, position, target);
  return { position, target };
}

function distance(p: { position: Vec3Like; target: Vec3Like }): number {
  return Math.hypot(
    p.position.x - p.target.x,
    p.position.y - p.target.y,
    p.position.z - p.target.z,
  );
}

function expectPose(actual: { position: Vec3Like; target: Vec3Like }, expected: CameraPose) {
  const flat = [
    actual.position.x,
    actual.position.y,
    actual.position.z,
    actual.target.x,
    actual.target.y,
    actual.target.z,
  ];
  const want = [...expected.position, ...expected.target];
  flat.forEach((value, i) => {
    expect(value).toBeCloseTo(want[i] ?? Number.NaN, 3);
  });
}

// The Milky Way's shots (docs/capture/milky-way.md): the disc at an angle, and close to Sgr A*.
const disc: CameraPose = { position: [60_000, -55_000, 70_000], target: [0, 0, 0] };
const core: CameraPose = { position: [900, -400, 1_100], target: [0, 0, 0] };
const sun: CameraPose = { position: [-15_000, -2_000, 30_000], target: [-21_000, 0, 16_000] };

describe('the capture move (D-55)', () => {
  it('starts exactly at the start and ends exactly at the end', () => {
    for (const [from, to] of [
      [disc, core],
      [core, sun],
      [sun, disc],
    ] as const) {
      const plan = planMove(from, to, OPTIONS);
      expectPose(pose(plan, 0), from);
      expectPose(pose(plan, 1), to);
    }
  });

  it('zooms exponentially: halfway is the geometric mean of the distances', () => {
    const plan = planMove(disc, core, OPTIONS);
    const middle = distance(pose(plan, 0.5));
    const from = Math.hypot(...disc.position);
    const to = Math.hypot(...core.position);
    // Easing is symmetric, so halfway in time is halfway along the path.
    expect(middle).toBeCloseTo(Math.sqrt(from * to), 0);
    // A straight line would still be about halfway out: (from + to) / 2.
    expect(middle).toBeLessThan((from + to) / 4);
  });

  it('pulls back to travel between two close views far apart', () => {
    const near: CameraPose = { position: [0, -1_000, 1_000], target: [0, 0, 0] };
    const farAway: CameraPose = { position: [40_000, -1_000, 1_000], target: [40_000, 0, 0] };
    const plan = planMove(near, farAway, OPTIONS);
    const start = distance(pose(plan, 0));
    const middle = pose(plan, 0.5);
    expect(distance(middle)).toBeGreaterThan(start * 5);
    // Halfway in time, halfway across: the path is symmetric when the ends are the same size.
    expect(middle.target.x).toBeCloseTo(20_000, 0);
  });

  it('turns the short way round, plus any spin', () => {
    const east: CameraPose = { position: [1_000, 0, 0], target: [0, 0, 0] };
    const south: CameraPose = { position: [0, 0, -1_000], target: [0, 0, 0] };
    // From +x to −z is a quarter turn one way or three quarters the other: take the quarter.
    const middle = pose(planMove(east, south, OPTIONS), 0.5);
    expect(middle.position.x).toBeGreaterThan(0);
    expect(middle.position.z).toBeLessThan(0);

    // A full turn on the spot comes back to where it started, through the far side.
    const turntable = planMove(east, east, { ...OPTIONS, spinDeg: 360 });
    expect(pose(turntable, 0.5).position.x).toBeCloseTo(-1_000, 3);
    expectPose(pose(turntable, 1), east);
  });

  it('keeps its distance while only turning', () => {
    const plan = planMove(disc, disc, { ...OPTIONS, spinDeg: 90 });
    for (const t of [0.1, 0.4, 0.7]) {
      expect(distance(pose(plan, t))).toBeCloseTo(Math.hypot(...disc.position), 3);
    }
  });

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    // Slow at the ends: the first and last tenth of the time cover under 3 % of the way each.
    expect(easeInOut(0.1)).toBeLessThan(0.03);
    expect(1 - easeInOut(0.9)).toBeLessThan(0.03);
  });

  it('holds still outside 0 to 1', () => {
    const plan = planMove(disc, core, OPTIONS);
    expectPose(pose(plan, -0.5), disc);
    expectPose(pose(plan, 1.5), core);
  });
});
