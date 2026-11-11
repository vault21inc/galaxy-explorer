import { resolvePlanetSurface, type PlanetAppearance } from '@ge/domain';
import type { WebGLRenderer } from 'three';
import { bakeInto, bakeTarget } from '../bake.ts';
import { planetBakeDefinition, type PlanetBakeOutput } from './planet-surface-bake.ts';

export interface PlanetBakeProbe {
  /** FNV-1a of every byte read back: identical inputs must give an identical hash. */
  hash: string;
  /** The largest difference between texel columns 0 and width − 1, in 1/255 steps. */
  seamMaxDiff: number;
  /** The largest difference within the top and bottom rows (each one point, a pole). */
  poleMaxDiff: number;
  /** One bake, from the draw to the GPU finishing it, with the shader already compiled. */
  durationMs: number;
}

/**
 * Bakes a planet off screen and reads it back (M6-T2's determinism, seam and timing checks, via
 * `window.__GE_TEST__.bakePlanet`). Test hooks only: reading pixels back stalls the GPU.
 */
export function probePlanetBake(
  gl: WebGLRenderer,
  appearance: PlanetAppearance,
  fallbackSeed: number,
  output: PlanetBakeOutput,
  widthPx: number,
  heightPx: number,
): PlanetBakeProbe {
  const surface = resolvePlanetSurface(appearance, fallbackSeed);
  const target = bakeTarget(widthPx, heightPx);
  try {
    const one = new Uint8Array(4);
    // The first bake compiles the shader, which isn't part of a bake's cost once the app runs.
    bakeInto(gl, planetBakeDefinition(surface, output, widthPx, heightPx), target);
    gl.readRenderTargetPixels(target, 0, 0, 1, 1, one);
    const start = performance.now();
    bakeInto(gl, planetBakeDefinition(surface, output, widthPx, heightPx), target);
    // Reading one pixel waits for the GPU to finish the bake (and its mipmaps).
    gl.readRenderTargetPixels(target, 0, 0, 1, 1, one);
    const durationMs = performance.now() - start;

    const pixels = new Uint8Array(widthPx * heightPx * 4);
    gl.readRenderTargetPixels(target, 0, 0, widthPx, heightPx, pixels);
    return {
      hash: fnv1a(pixels),
      seamMaxDiff: seamDiff(pixels, widthPx, heightPx),
      poleMaxDiff: Math.max(
        rowSpread(pixels, widthPx, 0),
        rowSpread(pixels, widthPx, heightPx - 1),
      ),
      durationMs,
    };
  } finally {
    target.dispose();
  }
}

function fnv1a(bytes: Uint8Array): string {
  let hash = 2_166_136_261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16_777_619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function seamDiff(pixels: Uint8Array, widthPx: number, heightPx: number): number {
  let max = 0;
  for (let row = 0; row < heightPx; row++) {
    const left = row * widthPx * 4;
    const right = left + (widthPx - 1) * 4;
    for (let channel = 0; channel < 4; channel++) {
      max = Math.max(max, Math.abs((pixels[left + channel] ?? 0) - (pixels[right + channel] ?? 0)));
    }
  }
  return max;
}

function rowSpread(pixels: Uint8Array, widthPx: number, row: number): number {
  let max = 0;
  const start = row * widthPx * 4;
  for (let column = 1; column < widthPx; column++) {
    for (let channel = 0; channel < 4; channel++) {
      const first = pixels[start + channel] ?? 0;
      max = Math.max(max, Math.abs((pixels[start + column * 4 + channel] ?? 0) - first));
    }
  }
  return max;
}
