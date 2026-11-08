/**
 * How long each label update took (rendering.md §11's budget: 2 ms per frame with 200 labels).
 * Keeps the last LABEL_STATS_SAMPLES durations; the test hooks and `pnpm perf` read the median
 * and 95th percentile.
 */
const LABEL_STATS_SAMPLES = 600;

class DurationLog {
  readonly #samples = new Float64Array(LABEL_STATS_SAMPLES);
  #count = 0;

  record(durationMs: number): void {
    this.#samples[this.#count % LABEL_STATS_SAMPLES] = durationMs;
    this.#count++;
  }

  reset(): void {
    this.#count = 0;
  }

  stats(): { count: number; medianMs: number; p95Ms: number } {
    const n = Math.min(this.#count, LABEL_STATS_SAMPLES);
    const sorted = Array.from(this.#samples.subarray(0, n)).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))] ?? 0;
    return { count: this.#count, medianMs: at(0.5), p95Ms: at(0.95) };
  }
}

export const labelTimeline = new DurationLog();
