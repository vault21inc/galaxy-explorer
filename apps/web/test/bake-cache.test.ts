import type { WebGLRenderTarget } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BakeCache } from '../src/render/bake/bake-cache.ts';
import { discBakeKey } from '../src/render/galaxy/disc-bake.ts';
import { resolveGalaxySettings } from '@ge/domain/galaxy';

const fakeTarget = () => ({ dispose: vi.fn() }) as unknown as WebGLRenderTarget;

/** A stand-in render target, and the spy on its `dispose`. */
function spiedTarget() {
  const dispose = vi.fn();
  return { target: { dispose } as unknown as WebGLRenderTarget, dispose };
}

describe('BakeCache', () => {
  it('bakes once per key', () => {
    const cache = new BakeCache(2);
    const create = vi.fn(fakeTarget);
    const first = cache.get('a', create);
    expect(cache.get('a', create)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('evicts and disposes the least recently used texture', () => {
    const cache = new BakeCache(2);
    const a = spiedTarget();
    const b = spiedTarget();
    cache.get('a', () => a.target);
    cache.get('b', () => b.target);
    cache.get('a', fakeTarget); // a is now the most recently used
    cache.get('c', fakeTarget);
    expect(b.dispose).toHaveBeenCalledOnce();
    expect(a.dispose).not.toHaveBeenCalled();
    expect(cache.size).toBe(2);
  });

  it('disposes everything on clear', () => {
    const cache = new BakeCache(2);
    const a = spiedTarget();
    cache.get('a', () => a.target);
    cache.clear();
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });
});

describe('discBakeKey', () => {
  const base = resolveGalaxySettings({ seed: 1 });

  it('changes with anything the disc shows', () => {
    expect(discBakeKey({ ...base, arms: 2 }, 2_048)).not.toBe(discBakeKey(base, 2_048));
    expect(discBakeKey(base, 1_024)).not.toBe(discBakeKey(base, 2_048));
  });

  it("ignores the disc's thickness, which a top-down image can't show", () => {
    expect(discBakeKey({ ...base, thicknessLy: 3_000 }, 2_048)).toBe(discBakeKey(base, 2_048));
  });
});
