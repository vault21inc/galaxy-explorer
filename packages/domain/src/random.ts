/**
 * Seeded randomness: the same seed always gives the same sequence, which `Math.random` can't
 * do. Seeds, the galaxy background and the sky use it so they're identical on every run.
 */

/** A small, fast generator (mulberry32) returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A normally distributed number (mean 0, standard deviation 1) from two uniform ones: the
 * Box–Muller transform.
 */
export function gaussian(random: () => number): number {
  const u = 1 - random(); // (0, 1], so the logarithm is finite
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
