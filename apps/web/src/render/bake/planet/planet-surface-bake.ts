import { seededRandom, type PlanetSurface } from '@ge/domain';
import { Vector2, Vector3 } from 'three';
import type { BakeDefinition } from '../bake.ts';

/**
 * The planet generator (rendering.md §9, M6-T2): one fragment shader that paints a planet's
 * surface into an equirectangular texture, from a `PlanetSurface` (@ge/domain planet-presets.ts)
 * passed as uniforms. Two outputs, baked separately:
 * - `surface`: the albedo (the surface's color in daylight, sRGB) in RGB, and the ocean mask
 *   (1 on water, where M6-T3's globe adds a specular highlight) in alpha;
 * - `layers`: night lights (R) and cloud cover (G), for the orbit view's globe (M6-T3).
 *
 * **No seams, no pinching.** Each texel's coordinates are turned into its lat/lon and then the
 * point on the unit sphere it shows (the same convention as @ge/domain geo/latlon.ts), and all
 * noise is computed there, in 3D. Neighbouring points on the globe get neighbouring values even
 * where the texture's left and right edges meet, and the poles aren't stretched noise.
 *
 * **Edge texels on the edges.** Column 0 and the last column both lie exactly on the ±180°
 * meridian, and the first and last rows on the poles, so the texture's two edges match where
 * they meet around the globe (the M6-T2 seam test). Texel x shows u = x / (width − 1) rather
 * than the usual (x + ½) / width; the renderers sample with the same mapping.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec2 uSize;            // texture width and height, in texels
  uniform int uOutput;           // 0 surface, 1 layers
  uniform vec3 uSeedOffset;      // shifts the noise field: one per seed
  uniform vec3 uPalette[6];      // sRGB, low to high
  uniform int uPaletteCount;
  uniform vec3 uOcean[2];        // deep, shallow (sRGB)
  uniform float uSeaLevel;       // < 0: no sea
  uniform float uFrequency;
  uniform int uOctaves;
  uniform float uWarp;
  uniform float uRidged;         // 1: ridged noise
  uniform float uPolarCaps;      // < 0: none
  uniform vec2 uBands;           // count, turbulence; count 0: not a gas giant
  uniform int uLightsKind;       // 0 none, 1 cities, 2 lava cracks
  uniform vec3 uLightsColor;     // sRGB: lava cracks glow in daylight too
  uniform float uCloudCoverage;  // < 0: no clouds

  const float PI = 3.141592653589793;

  // A pseudo-random gradient per lattice point, without sin() (whose precision differs between
  // GPUs): Dave Hoskins' "Hash without Sine" (MIT licence).
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
  }
  float hash11(float x) {
    x = fract(x * 0.1031);
    x *= x + 33.33;
    x *= x + x;
    return fract(x);
  }

  // Gradient noise in 3D: smooth, about −0.7 to 0.7. At each corner of the unit cube around p
  // a random gradient is dotted with the offset to p, and the eight results are blended with a
  // quintic curve, whose first and second derivatives are 0 at the corners, so it has no creases.
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    #define CORNER(o) dot(hash33(i + o), f - o)
    return mix(
      mix(mix(CORNER(vec3(0, 0, 0)), CORNER(vec3(1, 0, 0)), u.x),
          mix(CORNER(vec3(0, 1, 0)), CORNER(vec3(1, 1, 0)), u.x), u.y),
      mix(mix(CORNER(vec3(0, 0, 1)), CORNER(vec3(1, 0, 1)), u.x),
          mix(CORNER(vec3(0, 1, 1)), CORNER(vec3(1, 1, 1)), u.x), u.y), u.z);
  }

  // Fractal noise: octaves of noise, each twice as fine and half as strong. Ridged noise folds
  // each octave (1 − |n|), which turns its zero crossings into sharp crests. Returns 0–1.
  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amplitude = 0.5;
    float total = 0.0;
    for (int o = 0; o < 8; o++) {
      if (o >= octaves) break;
      float n = noise(p);
      n = uRidged > 0.5 ? pow(1.0 - abs(n) * 1.4, 2.0) : 0.5 + n * 0.75;
      sum += amplitude * n;
      total += amplitude;
      p = p * 2.03 + 0.17;
      amplitude *= 0.5;
    }
    return clamp(sum / total, 0.0, 1.0);
  }

  // A color from the palette at t (0–1), blending neighbouring stops.
  vec3 paletteAt(float t) {
    float scaled = clamp(t, 0.0, 1.0) * float(uPaletteCount - 1);
    int index = int(floor(scaled));
    vec3 a = uPalette[0];
    vec3 b = uPalette[0];
    for (int k = 0; k < 6; k++) {
      if (k == index) a = uPalette[k];
      if (k == min(index + 1, uPaletteCount - 1)) b = uPalette[k];
    }
    return mix(a, b, smoothstep(0.0, 1.0, fract(scaled)));
  }

  void main() {
    // Edge-inclusive texel coordinates: column 0 at u = 0, the last column at u = 1.
    vec2 uv = (vUv * uSize - 0.5) / (uSize - 1.0);
    float lon = (uv.x - 0.5) * 2.0 * PI;
    float lat = (uv.y - 0.5) * PI;
    // The point on the unit sphere this texel shows (geo/latlon.ts latLonToUnitVector).
    vec3 dir = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
    vec3 p = dir * uFrequency + uSeedOffset;

    // Domain warp: displace the sampling point by noise before sampling, so coasts and bands
    // swirl instead of looking like plain blobs.
    vec3 bend = vec3(fbm(p + 1.7, 3), fbm(p + 9.2, 3), fbm(p + 4.1, 3)) - 0.5;
    vec3 q = p + uWarp * 1.5 * bend;
    float height = fbm(q, uOctaves);

    vec3 color;
    float sea = 0.0;
    if (uBands.x > 0.0) {
      // A gas giant: bands across latitude, bent by turbulence. Each band picks two random
      // palette positions and blends between them across its width.
      float v = (lat / PI + 0.5) * uBands.x + uBands.y * 3.0 * (fbm(q * vec3(1.0, 3.0, 1.0), 4) - 0.5);
      float band = floor(v);
      float seed = uSeedOffset.x;
      color = mix(paletteAt(hash11(band + seed)), paletteAt(hash11(band + 1.0 + seed)),
                  smoothstep(0.0, 1.0, fract(v)));
    } else if (uSeaLevel >= 0.0 && height < uSeaLevel) {
      sea = 1.0;
      // Shallow water near the coast, deep further out.
      color = mix(uOcean[0], uOcean[1], smoothstep(0.55, 1.0, height / max(uSeaLevel, 1e-3)));
    } else {
      float land = uSeaLevel >= 0.0 ? (height - uSeaLevel) / max(1.0 - uSeaLevel, 1e-3) : height;
      color = paletteAt(land);
    }

    // Ice caps, with a ragged edge.
    if (uPolarCaps >= 0.0) {
      float edge = uPolarCaps + 0.08 * (fbm(p * 2.5, 3) - 0.5);
      float cap = smoothstep(edge, edge + 0.03, abs(lat) / (0.5 * PI));
      color = mix(color, vec3(0.93, 0.95, 0.98), cap);
      sea *= 1.0 - cap;
    }

    // Night lights: cities on land in clusters with a fine grain, or the crests of lava's
    // ridged noise.
    float lights = 0.0;
    if (uLightsKind == 1 && sea < 0.5) {
      float clusters = smoothstep(0.6, 0.82, fbm(dir * uFrequency * 3.0 + uSeedOffset + 31.0, 4));
      float grain = step(0.45, fbm(dir * 90.0 + uSeedOffset, 2));
      lights = clusters * (0.35 + 0.65 * grain);
    } else if (uLightsKind == 2) {
      lights = smoothstep(0.8, 0.95, height);
      color = mix(color, uLightsColor, lights * 0.85);
    }

    if (uOutput == 0) {
      gl_FragColor = vec4(color, sea);
    } else {
      float clouds = 0.0;
      if (uCloudCoverage >= 0.0) {
        float c = fbm(dir * 4.0 + uSeedOffset + 57.0 + 0.6 * bend, 5);
        clouds = smoothstep(1.0 - uCloudCoverage - 0.08, 1.0 - uCloudCoverage + 0.18, c);
      }
      gl_FragColor = vec4(lights, clouds, 0.0, 1.0);
    }
  }
`;

export type PlanetBakeOutput = 'surface' | 'layers';

const OUTPUTS: Record<PlanetBakeOutput, number> = { surface: 0, layers: 1 };
const LIGHT_KINDS = { cities: 1, cracks: 2 } as const;
const MAX_PALETTE = 6;

/** "#rrggbb" to sRGB 0–1. The bake stores sRGB; renderers convert to linear light. */
function srgb(hex: string): Vector3 {
  const value = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/** The bake definition for one planet's surface or layers at a size (bake.ts). */
export function planetBakeDefinition(
  surface: PlanetSurface,
  output: PlanetBakeOutput,
  widthPx: number,
  heightPx: number,
): BakeDefinition {
  const random = seededRandom(surface.seed);
  const palette = Array.from({ length: MAX_PALETTE }, (_, i) =>
    srgb(surface.palette[Math.min(i, surface.palette.length - 1)] ?? '#808080'),
  );
  return {
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uSize: { value: new Vector2(widthPx, heightPx) },
      uOutput: { value: OUTPUTS[output] },
      // Far apart for different seeds, but small enough to keep float precision in the noise.
      uSeedOffset: {
        value: new Vector3(random() * 200 - 100, random() * 200 - 100, random() * 200 - 100),
      },
      uPalette: { value: palette },
      uPaletteCount: { value: Math.min(Math.max(surface.palette.length, 2), MAX_PALETTE) },
      uOcean: { value: [srgb(surface.ocean[0]), srgb(surface.ocean[1])] },
      uSeaLevel: { value: surface.seaLevel ?? -1 },
      uFrequency: { value: surface.frequency },
      uOctaves: { value: surface.octaves },
      uWarp: { value: surface.warp },
      uRidged: { value: surface.ridged ? 1 : 0 },
      uPolarCaps: { value: surface.polarCaps ?? -1 },
      uBands: {
        value: new Vector2(surface.bands?.count ?? 0, surface.bands?.turbulence ?? 0),
      },
      uLightsKind: { value: surface.lights ? LIGHT_KINDS[surface.lights.kind] : 0 },
      uLightsColor: { value: srgb(surface.lights?.color ?? '#000000') },
      uCloudCoverage: { value: surface.clouds?.coverage ?? -1 },
    },
  };
}

/** Everything that changes a bake's pixels: the bake cache's key. */
export function planetBakeKey(
  surface: PlanetSurface,
  output: PlanetBakeOutput,
  widthPx: number,
): string {
  return `planet:${output}:${widthPx.toString()}:${JSON.stringify(surface)}`;
}
