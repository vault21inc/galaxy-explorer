import { describe, expect, it } from 'vitest';
import { FrameRateGuard } from '../src/render/frame-rate-guard.ts';
import { useQuality } from '../src/state/quality.ts';
import { useStarField } from '../src/state/star-field.ts';

const feed = (guard: FrameRateGuard, intervalMs: number, count: number) => {
  let tripped = false;
  for (let i = 0; i < count; i++) tripped = guard.record(intervalMs) || tripped;
  return tripped;
};

describe('FrameRateGuard', () => {
  it('steps down after 2 s of rendering below 45 fps', () => {
    const guard = new FrameRateGuard(45, 2_000);
    // 30 fps: 33 ms frames; 2 s of them is 60 frames.
    expect(feed(guard, 33, 59)).toBe(false);
    expect(feed(guard, 33, 2)).toBe(true);
  });

  it('never steps down at a healthy frame rate', () => {
    const guard = new FrameRateGuard(45, 2_000);
    expect(feed(guard, 16.7, 1_000)).toBe(false);
  });

  it('ignores idle gaps between bursts of rendering', () => {
    const guard = new FrameRateGuard(45, 2_000);
    // Short bursts at 60 fps separated by pauses: the pauses aren't slow frames.
    let tripped = false;
    for (let burst = 0; burst < 100; burst++) {
      tripped = guard.record(1_500) || tripped;
      tripped = feed(guard, 16.7, 10) || tripped;
    }
    expect(tripped).toBe(false);
  });

  it("judges by the median, so a few hitches don't count", () => {
    const guard = new FrameRateGuard(45, 2_000);
    let tripped = false;
    for (let i = 0; i < 200; i++) tripped = guard.record(i % 10 === 0 ? 120 : 16.7) || tripped;
    expect(tripped).toBe(false);
  });

  it('doesn’t count frames a timer draws on purpose as slow (ambient motion at 30 fps)', () => {
    const guard = new FrameRateGuard(45, 2_000);
    let tripped = false;
    for (let i = 0; i < 600; i++) tripped = guard.record(33.3, 33.3) || tripped;
    expect(tripped).toBe(false);
  });

  it('still steps down when frames are slower than the timer asks for', () => {
    const guard = new FrameRateGuard(45, 2_000);
    let tripped = false;
    // A GPU that can't keep up with the timer: 60 ms frames while ambient motion asks for 33.
    for (let i = 0; i < 40; i++) tripped = guard.record(60, 33.3) || tripped;
    expect(tripped).toBe(true);
  });
});

describe('stepping the quality down', () => {
  it('goes one level lower, says so, and stops at Low', () => {
    useQuality.setState({ level: 'high', notice: null });
    useQuality.getState().stepDown();
    expect(useQuality.getState().level).toBe('medium');
    expect(useQuality.getState().notice).toContain('Medium');
    useQuality.getState().stepDown();
    useQuality.getState().stepDown();
    expect(useQuality.getState().level).toBe('low');
  });
});

describe('the star field preference', () => {
  it('keeps both shares between 0 and 1, and a broken value falls back to the default', () => {
    const { setDensity, setBrightness } = useStarField.getState();
    setDensity(0.4);
    setBrightness(2);
    expect(useStarField.getState()).toMatchObject({ density: 0.4, brightness: 1 });
    setDensity(-1);
    setBrightness(Number.NaN);
    expect(useStarField.getState()).toMatchObject({ density: 0, brightness: 1 });
    setDensity(1);
  });
});
