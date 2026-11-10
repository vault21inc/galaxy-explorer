import { describe, expect, it } from 'vitest';
import {
  atFarLimit,
  atNearLimit,
  enterDistance,
  MomentumGuard,
  Push,
  stopDistance,
} from '../src/render/camera/thresholds.ts';
import {
  ENTER_DISTANCE_RADII,
  MOMENTUM_GUARD_MS,
  PUSH_RESET_MS,
  STOP_DISTANCE_RADII,
  WHEEL_STREAM_GAP_MS,
} from '../src/render/tuning.ts';

/** Zoom thresholds, push hysteresis and the momentum guard (M5-T2, rendering.md §4). */

describe('distance limits', () => {
  it('are multiples of the drawn radius, never inside the view’s own minimum', () => {
    expect(enterDistance('galaxy', 120, 20)).toBe(ENTER_DISTANCE_RADII.galaxy * 120);
    expect(stopDistance('system', 0.08, 0.2)).toBe(
      Math.max(STOP_DISTANCE_RADII.system * 0.08, 0.2),
    );
    expect(enterDistance('system', 0.001, 0.2)).toBe(0.2);
  });

  it('count as reached within a small slack, since the camera eases into them', () => {
    expect(atNearLimit(101, 100)).toBe(true);
    expect(atNearLimit(110, 100)).toBe(false);
    expect(atFarLimit(99, 100)).toBe(true);
    expect(atFarLimit(90, 100)).toBe(false);
  });
});

describe('the push past a limit', () => {
  it('fills with sustained input and lapses after a pause', () => {
    const push = new Push();
    expect(push.add('enter:a', -60, 0, 120)).toBe(0.5);
    expect(push.add('enter:a', -60, 50, 120)).toBe(1);
    push.reset();
    push.add('enter:a', -60, 1_000, 120);
    expect(push.add('enter:a', -60, 1_000 + PUSH_RESET_MS + 1, 120)).toBe(0.5);
  });

  it('starts over for another object or direction', () => {
    const push = new Push();
    push.add('enter:a', -100, 0, 120);
    expect(push.add('enter:b', -60, 10, 120)).toBe(0.5);
    expect(push.add('exit:s', 60, 20, 120)).toBe(0.5);
  });
});

describe('the momentum guard', () => {
  it('lets wheel input through when no change of view has happened', () => {
    const guard = new MomentumGuard();
    expect(guard.allow(100, Number.NEGATIVE_INFINITY, false)).toBe(true);
    expect(guard.allow(116, Number.NEGATIVE_INFINITY, false)).toBe(true);
  });

  it('drops the rest of a stream that was flowing when the change started', () => {
    const guard = new MomentumGuard();
    let now = 0;
    for (; now < 200; now += 16) guard.allow(now, Number.NEGATIVE_INFINITY, false);
    const start = now;
    // Inertia keeps arriving every frame, through the transition and well after it.
    for (; now < start + 2_000; now += 16)
      expect(guard.allow(now, start, now < start + 900)).toBe(false);
    // The fingers lift; a new scroll works at once.
    now += WHEEL_STREAM_GAP_MS;
    expect(guard.allow(now, start, false)).toBe(true);
  });

  it('drops everything for a moment after a change that no scrolling started', () => {
    const guard = new MomentumGuard();
    const start = 10_000; // a double-click
    expect(guard.allow(start + 100, start, false)).toBe(false);
    expect(guard.allow(start + MOMENTUM_GUARD_MS + WHEEL_STREAM_GAP_MS + 200, start, false)).toBe(
      true,
    );
  });
});
