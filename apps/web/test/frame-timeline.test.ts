import { describe, expect, it } from 'vitest';
import { FrameTimeline, IDLE_GAP_MS, percentile } from '../src/render/frame-timeline.ts';

/** Records frames at the given times, in milliseconds. */
function timelineWith(timesMs: number[]) {
  const timeline = new FrameTimeline();
  for (const timeMs of timesMs) timeline.record(timeMs);
  return timeline;
}

describe('FrameTimeline', () => {
  it('reports the median and 95th-percentile interval between frames', () => {
    // 20 frames 16 ms apart, then one slow 40 ms frame.
    const times = Array.from({ length: 20 }, (_, i) => 1000 + i * 16);
    times.push((times.at(-1) ?? 0) + 40);

    expect(timelineWith(times).stats()).toEqual({ count: 21, medianMs: 16, p95Ms: 16 });
    times.push((times.at(-1) ?? 0) + 40);
    expect(timelineWith(times).stats().p95Ms).toBe(40);
  });

  it('leaves idle gaps out of the frame times', () => {
    const stats = timelineWith([0, 16, 32, 32 + IDLE_GAP_MS + 1, 32 + IDLE_GAP_MS + 17]).stats();

    expect(stats.count).toBe(5);
    expect(stats.medianMs).toBe(16);
    expect(stats.p95Ms).toBe(16);
  });

  it('counts only frames after a reset, but keeps the total frame count', () => {
    const timeline = timelineWith([10, 20, 30]);
    timeline.reset(30);
    expect(timeline.stats()).toEqual({ count: 0, medianMs: 0, p95Ms: 0 });

    timeline.record(40);
    timeline.record(50);
    expect(timeline.stats()).toEqual({ count: 2, medianMs: 10, p95Ms: 10 });
    expect(timeline.frameCount).toBe(5);
  });

  it('keeps working after the ring buffer wraps around', () => {
    const times = Array.from({ length: 10_000 }, (_, i) => i * 10);
    const timeline = timelineWith(times);

    expect(timeline.frameCount).toBe(10_000);
    expect(timeline.stats(times.at(-6))).toEqual({ count: 5, medianMs: 10, p95Ms: 10 });
  });
});

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 0.95)).toBe(10);
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([], 0.5)).toBe(0);
  });
});
