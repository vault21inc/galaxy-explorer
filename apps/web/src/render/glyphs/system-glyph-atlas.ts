import type { BakeDefinition } from '../bake/bake.ts';
import { SYSTEM_GLYPH_EXTENT } from '../tuning.ts';

/** The atlas's grid: one column per planet count (0–7), one row per star count (1–3, and spare). */
export const SYSTEM_ATLAS_COLUMNS = 8;
export const SYSTEM_ATLAS_ROWS = 4;

/**
 * Every system glyph, baked once into one texture (D-28, D-29; rendering.md §9): a cell for each
 * star count (rows) and planet count (columns). Each cell, from its center outward:
 *
 * - **the stars:** one at the center, a pair side by side, or a small triangle. Each star's light
 *   (a solid core and a soft glow) is stored in its own color channel, red, green and blue for
 *   stars 1–3, so the draw shader can tint each star with its own color from one texture;
 * - **the planets:** one faint ring per planet, with a dot on it, stored in alpha. Rings start
 *   outside the star and stay inside the cell, so smaller copies of the texture (mipmaps)
 *   don't bleed into the neighbouring cell.
 *
 * Coordinates: `p` runs from −1 to 1 across a cell. The glyph's quad spans SYSTEM_GLYPH_EXTENT
 * times the system's radius, so the radius itself (the old sphere, picking and selection rings)
 * is a circle of 1 / SYSTEM_GLYPH_EXTENT in the middle.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec2 uGrid;
  uniform float uStarRadius;   // the system's radius within a cell
  varying vec2 vUv;

  // A star: a solid core with a soft edge, and a glow fading outward. 'r' is its radius.
  float star(vec2 p, vec2 center, float r) {
    float d = length(p - center) / r;
    float core = 1.0 - smoothstep(0.35, 0.55, d);
    float glow = exp(-3.0 * d) * 0.55;
    return clamp(core + glow, 0.0, 1.0);
  }

  void main() {
    vec2 cell = floor(vUv * uGrid);
    vec2 p = fract(vUv * uGrid) * 2.0 - 1.0;
    float planets = cell.x;
    float stars = cell.y + 1.0;
    float R = uStarRadius;

    vec3 light = vec3(0.0);
    if (stars < 1.5) {
      light.r = star(p, vec2(0.0), R);
    } else if (stars < 2.5) {
      // A binary: the larger star left of center, the smaller right of it.
      light.r = star(p, vec2(-0.32 * R, 0.0), 0.8 * R);
      light.g = star(p, vec2(0.36 * R, 0.0), 0.62 * R);
    } else {
      // A triple: a small triangle, largest at the top.
      light.r = star(p, vec2(0.0, 0.3 * R), 0.68 * R);
      light.g = star(p, vec2(-0.3 * R, -0.2 * R), 0.56 * R);
      light.b = star(p, vec2(0.3 * R, -0.2 * R), 0.46 * R);
    }

    // The planets: ring i at a fixed radius, its dot at a fixed angle (the golden angle apart,
    // so dots never line up).
    float rings = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= planets) break;
      float ringRadius = 1.25 * R + float(i) * (0.86 - 1.25 * R) / 6.0;
      float d = abs(length(p) - ringRadius);
      // Faint, thin rings; the planets' dots are what should catch the eye.
      rings += (1.0 - smoothstep(0.002, 0.009, d)) * 0.18;
      float angle = float(i) * 2.39996 + 0.7;
      vec2 dot = ringRadius * vec2(cos(angle), sin(angle));
      rings += 1.0 - smoothstep(0.032, 0.056, length(p - dot));
    }
    gl_FragColor = vec4(light, clamp(rings, 0.0, 1.0));
  }
`;

export const systemGlyphAtlasDefinition: BakeDefinition = {
  fragmentShader: FRAGMENT_SHADER,
  uniforms: {
    uGrid: { value: [SYSTEM_ATLAS_COLUMNS, SYSTEM_ATLAS_ROWS] },
    uStarRadius: { value: 1 / SYSTEM_GLYPH_EXTENT },
  },
};

export const systemGlyphAtlasKey = (cellPx: number) =>
  `system-glyphs:${cellPx.toString()}:${SYSTEM_GLYPH_EXTENT.toString()}`;

/** The atlas cell (column, row) for a glyph with these counts, clamped to what's baked. */
export function systemGlyphCell(stars: number, planets: number): [number, number] {
  const row = Math.min(Math.max(stars, 1), 3) - 1;
  const column = Math.min(Math.max(planets, 0), SYSTEM_ATLAS_COLUMNS - 1);
  return [column, row];
}
