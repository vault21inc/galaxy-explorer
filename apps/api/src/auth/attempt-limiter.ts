/**
 * Counts failed sign-ins and link attempts (M8-T1): after 5 failures in 15 minutes for one key,
 * such as an IP address or a username, that key must wait. Failures, not attempts, are counted,
 * so someone who signs in at the first try never gets near the limit.
 *
 * It's kept in memory: one API process serves the whole site (architecture.md §14), and a
 * restart forgetting the counts is harmless. M8-T3 adds a general rate limit on every route.
 */
export class AttemptLimiter {
  readonly #failures = new Map<string, number[]>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;

  constructor(options: { limit?: number; windowMs?: number; now?: () => number } = {}) {
    this.#limit = options.limit ?? 5;
    this.#windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.#now = options.now ?? Date.now;
  }

  /** Seconds until all of these keys may try again; 0 if they may now. */
  retryAfterS(keys: readonly string[]): number {
    const now = this.#now();
    let waitMs = 0;
    for (const key of keys) {
      const recent = this.#recent(key, now);
      const oldest = recent[0];
      if (recent.length >= this.#limit && oldest !== undefined) {
        waitMs = Math.max(waitMs, oldest + this.#windowMs - now);
      }
    }
    return Math.ceil(waitMs / 1000);
  }

  /** Records one failure for each key. */
  fail(keys: readonly string[]): void {
    const now = this.#now();
    for (const key of keys) this.#failures.set(key, [...this.#recent(key, now), now]);
    // Keys that stopped failing would otherwise stay forever: sweep now and then.
    if (this.#failures.size > 10_000) {
      for (const key of [...this.#failures.keys()]) {
        if (this.#recent(key, now).length === 0) this.#failures.delete(key);
      }
    }
  }

  /** Forgets a key's failures, such as a username's after it signs in. */
  clear(key: string): void {
    this.#failures.delete(key);
  }

  #recent(key: string, now: number): number[] {
    return (this.#failures.get(key) ?? []).filter((at) => at > now - this.#windowMs);
  }
}
