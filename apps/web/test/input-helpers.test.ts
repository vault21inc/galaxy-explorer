import { describe, expect, it } from 'vitest';
import { isClick } from '../src/input/click.ts';
import { gestureDeltaPx, wheelDeltaPx } from '../src/input/wheel.ts';
import {
  GESTURE_LOG_SCALE_TO_PX,
  PINCH_TO_WHEEL_PX,
  WHEEL_LINE_PX,
  WHEEL_MAX_PX,
} from '../src/render/tuning.ts';

const wheel = (deltaY: number, deltaMode = 0, ctrlKey = false) => ({ deltaY, deltaMode, ctrlKey });

describe('wheelDeltaPx', () => {
  it('passes pixel deltas through', () => {
    expect(wheelDeltaPx(wheel(40), 800)).toBe(40);
  });

  it('turns lines and pages into pixels', () => {
    expect(wheelDeltaPx(wheel(3, 1), 800)).toBe(3 * WHEEL_LINE_PX);
    expect(wheelDeltaPx(wheel(0.1, 2), 800)).toBeCloseTo(80);
  });

  it('scales a pinch (ctrl+wheel) to match scrolling', () => {
    expect(wheelDeltaPx(wheel(-5, 0, true), 800)).toBe(-5 * PINCH_TO_WHEEL_PX);
  });

  it('caps one big flick', () => {
    expect(wheelDeltaPx(wheel(10_000), 800)).toBe(WHEEL_MAX_PX);
    expect(wheelDeltaPx(wheel(-10_000), 800)).toBe(-WHEEL_MAX_PX);
  });
});

describe('gestureDeltaPx', () => {
  it('zooms in (negative delta) when the pinch spreads', () => {
    expect(gestureDeltaPx(1.1, 1, GESTURE_LOG_SCALE_TO_PX)).toBeLessThan(0);
    expect(gestureDeltaPx(0.9, 1, GESTURE_LOG_SCALE_TO_PX)).toBeGreaterThan(0);
  });

  it('matches the ctrl+wheel form of the same pinch', () => {
    // Chrome reports a pinch by scale s as deltaY ≈ −100 × ln(s).
    const scale = 1.05;
    const chromeDelta = -100 * Math.log(scale);
    expect(gestureDeltaPx(scale, 1, GESTURE_LOG_SCALE_TO_PX)).toBeCloseTo(
      wheelDeltaPx(wheel(chromeDelta, 0, true), 800),
    );
  });
});

describe('isClick', () => {
  it('counts a press that moved less than 4 px as a click', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(true);
  });

  it('counts 4 px or more as a drag', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(false);
  });
});
