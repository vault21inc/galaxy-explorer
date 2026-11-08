import type { WebGLRenderTarget } from 'three';
import { BAKE_CACHE_SIZE } from '../tuning.ts';

/**
 * Baked textures by key (rendering.md §9), least recently used first out. An evicted texture
 * is disposed, freeing its GPU memory. Keys must describe everything that changes the result:
 * the generator, its parameters and the size.
 *
 * Bakes are fast enough (under 50 ms) that nothing is kept between sessions. A texture in use
 * could be evicted if more than BAKE_CACHE_SIZE others were baked meanwhile; with one disc per
 * map that can't happen yet, and the orbit view (M6) adds pinning if it needs to.
 */
export class BakeCache {
  readonly #entries = new Map<string, WebGLRenderTarget>();
  readonly #capacity: number;

  constructor(capacity = BAKE_CACHE_SIZE) {
    this.#capacity = capacity;
  }

  get(key: string, create: () => WebGLRenderTarget): WebGLRenderTarget {
    const existing = this.#entries.get(key);
    if (existing) {
      // A Map iterates in insertion order, so re-inserting marks the entry as newest.
      this.#entries.delete(key);
      this.#entries.set(key, existing);
      return existing;
    }
    const created = create();
    this.#entries.set(key, created);
    while (this.#entries.size > this.#capacity) {
      const [oldestKey, oldest] = this.#entries.entries().next().value ?? [];
      if (oldestKey === undefined || !oldest) break;
      this.#entries.delete(oldestKey);
      oldest.dispose();
    }
    return created;
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    for (const target of this.#entries.values()) target.dispose();
    this.#entries.clear();
  }
}

/** The app's cache. The canvas lives as long as the page, so the cache does too. */
export const bakeCache = new BakeCache();
