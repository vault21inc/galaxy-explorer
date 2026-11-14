/**
 * Renderers that draw frames on a timer on purpose, such as ambient motion's 30 a second
 * (rendering.md §8). The frame-rate guard (quality-guard.tsx) reads this: a frame that arrives
 * when the timer asked for it isn't a slow frame, however long since the one before.
 */
const intervals = new Map<symbol, number>();
/** The longest interval of the timers running now, in ms; 0 when none is. Read every frame. */
let longestMs = 0;

/** Registers a timer that asks for a frame every `intervalMs`; returns its release. */
export function paceFrames(intervalMs: number): () => void {
  const key = Symbol('paced frames');
  intervals.set(key, intervalMs);
  longestMs = Math.max(...intervals.values());
  return () => {
    intervals.delete(key);
    longestMs = intervals.size === 0 ? 0 : Math.max(...intervals.values());
  };
}

export function pacedIntervalMs(): number {
  return longestMs;
}
