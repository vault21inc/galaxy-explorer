import { IDLE_GAP_MS } from './frame-timeline.ts';

/**
 * Decides when to lower the quality setting (rendering.md §13): when the median frame rate stays
 * below a floor for a stretch of rendering, about 2 seconds of interaction. Pure, so it's
 * unit-tested.
 *
 * It looks at intervals between rendered frames and, like the HUD, skips gaps longer than
 * IDLE_GAP_MS: with on-demand rendering, a pause between two drags is idle time, not a slow
 * frame. (drei's PerformanceMonitor counts frames per time window instead, which reads those
 * pauses as a low frame rate and would step down for no reason.)
 */
export class FrameRateGuard {
  readonly #intervalsMs: Float64Array;
  #count = 0;
  #renderedMs = 0;
  readonly #floorFps: number;
  readonly #windowMs: number;

  constructor(floorFps: number, windowMs: number, capacity = 2_048) {
    this.#floorFps = floorFps;
    this.#windowMs = windowMs;
    this.#intervalsMs = new Float64Array(capacity);
  }

  /**
   * Records the interval since the previous frame. Returns true when a full window of
   * rendering has a median below the floor: time to step down. The window then starts over.
   */
  record(intervalMs: number): boolean {
    if (intervalMs <= 0 || intervalMs > IDLE_GAP_MS) return false;
    if (this.#count < this.#intervalsMs.length) this.#intervalsMs[this.#count++] = intervalMs;
    this.#renderedMs += intervalMs;
    if (this.#renderedMs < this.#windowMs) return false;
    const sorted = this.#intervalsMs.subarray(0, this.#count).sort();
    const medianMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.reset();
    return medianMs > 1_000 / this.#floorFps;
  }

  reset(): void {
    this.#count = 0;
    this.#renderedMs = 0;
  }
}
