import { type RimGap } from '@ge/domain';
import { seededRandom } from '@ge/domain/galaxy';

/**
 * A storm's top-down texture (M4-T6, D-25), such as the Eye of Terror's: a bright, clumpy rim
 * around a darker core, radial filaments, and gaps in the rim (the Cadian Gate). Baked once per
 * set of settings on the CPU (rendering.md §9: never per frame), as RGBA bytes for a layer of
 * the storms' texture array. Pure, so the look is unit-tested.
 *
 * Everything is computed in polar coordinates around the disc's center: `r` from 0 (center) to
 * 1 (edge), and the angle `a` from 0 to 2π. The texture is the same at every rotation, so the
 * disc's `rotationDeg` is applied in the shader, not here.
 */
export interface StormParams {
  /** The darker core's radius, as a share of the disc's (0 to 0.9). */
  innerRadius: number;
  /** The interior's color and the rim's, as #rrggbb. */
  color: string;
  rimColor: string;
  /** How strongly radial filaments streak the disc (0 to 1). */
  filaments: number;
  gaps: readonly RimGap[];
  /** Seeds the clumps, so each storm keeps its own look on every load. */
  seed: number;
}

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

/** What the baked pixels depend on: equal keys share one bake. */
export function stormBakeKey(params: StormParams): string {
  const gaps = params.gaps.map(
    (gap) => `${round(gap.angleDeg).toString()}/${round(gap.widthDeg).toString()}`,
  );
  return [
    'storm',
    round(params.innerRadius).toString(),
    params.color.toLowerCase(),
    params.rimColor.toLowerCase(),
    round(params.filaments).toString(),
    gaps.join(','),
    params.seed.toString(),
  ].join(':');
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Value noise on a lattice that wraps around in x (the angle), so the noise meets itself at
 * 0 and 2π without a seam. Each lattice point holds a random value; between them it blends
 * smoothly. Returns 0 to 1.
 */
function wrappedNoise(random: () => number, cellsX: number, cellsY: number) {
  const values = Float32Array.from({ length: cellsX * (cellsY + 1) }, () => random());
  const at = (x: number, y: number) =>
    values[(((x % cellsX) + cellsX) % cellsX) + Math.min(cellsY, Math.max(0, y)) * cellsX] ?? 0;
  return (u: number, v: number) => {
    const x = u * cellsX;
    const y = v * cellsY;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(0, 1, x - x0);
    const fy = smoothstep(0, 1, y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

const rgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** How much of the rim a gap removes at angle `a` (radians): 0 inside the gap, 1 outside. */
function gapFactor(a: number, gaps: readonly RimGap[]): number {
  let factor = 1;
  for (const gap of gaps) {
    const center = (gap.angleDeg * Math.PI) / 180;
    const half = (gap.widthDeg * Math.PI) / 360;
    // The angle between a and the gap's center, the short way round (0 to π).
    const apart = Math.abs(((a - center + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    // Soft edges: fully open inside 70 % of the half-width, fully closed past 120 %.
    factor *= smoothstep(half * 0.7, half * 1.2, apart);
  }
  return factor;
}

/** The storm's pixels, `sizePx` a side, RGBA bytes with straight (not premultiplied) alpha. */
export function bakeStormPixels(params: StormParams, sizePx: number): Uint8Array {
  const random = seededRandom(params.seed);
  const clumps = wrappedNoise(random, 24, 8);
  const grain = wrappedNoise(random, 64, 20);
  const warp = wrappedNoise(random, 6, 3);
  // Per-streak strength, so filaments come and go around the disc instead of a regular comb.
  const streaks = wrappedNoise(random, 90, 1);
  const inner = Math.min(0.9, Math.max(0, params.innerRadius));
  // The rim's brightest line sits a third of the way from the core to the edge.
  const rimCenter = inner + (1 - inner) * 0.3;
  const rimWidth = (1 - inner) * 0.4 + 0.04;
  const core = rgb(params.color);
  const rim = rgb(params.rimColor);
  const pixels = new Uint8Array(sizePx * sizePx * 4);

  for (let j = 0; j < sizePx; j++) {
    for (let i = 0; i < sizePx; i++) {
      const u = ((i + 0.5) / sizePx) * 2 - 1;
      const v = ((j + 0.5) / sizePx) * 2 - 1;
      const r = Math.hypot(u, v);
      if (r >= 1) continue; // transparent outside the disc
      const a = (Math.atan2(v, u) + 2 * Math.PI) % (2 * Math.PI);
      const turn = a / (2 * Math.PI);

      // The rim: a soft ring, broken into bright clumps and darker lanes, with fine grain.
      const ring = Math.exp(-(((r - rimCenter) / rimWidth) ** 2));
      const clump = clumps(turn, r);
      const rimLight = ring * (0.25 + 0.95 * clump * clump) * (0.75 + 0.25 * grain(turn, r));
      // Filaments: thin streaks pointing out from the center, bending with a slow warp, each
      // with its own strength, so some are bright, some faint and some missing.
      const wobble = 9 * warp(turn, r);
      const streak = (0.5 + 0.5 * Math.sin(a * 55 + wobble)) ** 20;
      const strength = smoothstep(0.35, 0.85, streaks(turn, 0));
      const filament =
        params.filaments * streak * strength * smoothstep(inner * 0.6, rimCenter, r) * (1.1 - r);
      const open = gapFactor(a, params.gaps);
      const bright = Math.min(1, (rimLight + filament) * open);
      // The core: a dim veil of the interior color, darker toward the center.
      const veil = (1 - smoothstep(inner * 0.4, inner, r)) * (0.3 + 0.15 * grain(turn, r));
      // Fade out at the very edge of the disc.
      const edge = 1 - smoothstep(0.85, 1, r);
      const alpha = Math.min(1, veil + bright * 0.95) * edge;

      const index = (j * sizePx + i) * 4;
      for (let c = 0; c < 3; c++) {
        const dark = (core[c] ?? 0) * 0.6;
        pixels[index + c] = Math.round(dark + ((rim[c] ?? 0) - dark) * bright);
      }
      pixels[index + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}
