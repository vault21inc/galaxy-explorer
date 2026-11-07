/**
 * Records when frames render, for the performance HUD and the test hooks (rendering.md §14).
 * Pure, with no three.js, so it's unit-tested.
 *
 * "Frame time" here is the interval between two consecutive rendered frames: about 16.7 ms at
 * 60 fps. With on-demand rendering there are long gaps whenever nothing moves; those are idle
 * time, not slow frames, so intervals longer than `IDLE_GAP_MS` are left out of the statistics.
 */

/** How many frame timestamps are kept: about a minute at 60 fps. Older ones are overwritten. */
const CAPACITY = 4_096;

/**
 * An interval longer than this, in milliseconds, is treated as idle time between bursts of
 * rendering rather than as one slow frame. A real 250 ms stall during motion would be hidden,
 * but it would also be plainly visible.
 */
export const IDLE_GAP_MS = 250;

export interface FrameStats {
  /** Frames rendered in the window. */
  count: number;
  /** Median interval between consecutive frames, in milliseconds; 0 with fewer than 2 frames. */
  medianMs: number;
  /** 95th-percentile interval, in milliseconds; 0 with fewer than 2 frames. */
  p95Ms: number;
}

export class FrameTimeline {
  /** Every frame rendered since the page loaded. Never reset. */
  frameCount = 0;

  // A ring buffer, preallocated so that recording a frame never allocates (rendering.md §2,
  // rule 4: no allocations in the per-frame path).
  private readonly timesMs = new Float64Array(CAPACITY);
  private next = 0;
  private size = 0;
  private resetAtMs = -Infinity;

  /** Call once per rendered frame with the current time, in milliseconds. */
  record(nowMs: number): void {
    this.timesMs[this.next] = nowMs;
    this.next = (this.next + 1) % CAPACITY;
    this.size = Math.min(this.size + 1, CAPACITY);
    this.frameCount++;
  }

  /** Starts a new measurement window: `stats()` then counts only frames after `nowMs`. */
  reset(nowMs: number): void {
    this.resetAtMs = nowMs;
  }

  /** Statistics for frames rendered after `sinceMs`, by default since the last `reset()`. */
  stats(sinceMs = this.resetAtMs): FrameStats {
    const intervalsMs: number[] = [];
    let count = 0;
    let previousMs: number | undefined;

    for (let i = 0; i < this.size; i++) {
      // Oldest first: the oldest entry sits where the next write will go once the buffer is full.
      const timeMs = this.timesMs[(this.next - this.size + i + CAPACITY) % CAPACITY] ?? 0;
      if (timeMs <= sinceMs) continue;
      count++;
      if (previousMs !== undefined && timeMs - previousMs <= IDLE_GAP_MS) {
        intervalsMs.push(timeMs - previousMs);
      }
      previousMs = timeMs;
    }

    intervalsMs.sort((a, b) => a - b);
    return {
      count,
      medianMs: percentile(intervalsMs, 0.5),
      p95Ms: percentile(intervalsMs, 0.95),
    };
  }
}

/**
 * The value below which `fraction` of the sorted values fall (nearest-rank method); 0 for an
 * empty list.
 */
export function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil(fraction * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(rank, 0), sortedValues.length - 1)] ?? 0;
}
