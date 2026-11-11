import type { HexColor } from './colors.ts';
import type { PLANET_PRESETS, PlanetAppearance } from './schemas/appearance.ts';

/**
 * Planet surfaces as data (rendering.md §9, M6-T2): what each preset looks like, as numbers the
 * planet generator shader reads. A new preset is a new entry here, with no shader change.
 *
 * Heights come from 3D noise on the globe (0 lowest, 1 highest). Water fills everything under
 * the sea level; land above it is colored by the palette, low to high. Gas giants have no
 * surface: their palette colors bands across latitude instead.
 */
export type PlanetPresetName = (typeof PLANET_PRESETS)[number];

export interface PlanetPresetDef {
  label: string;
  /** Land colors from the shore to the peaks, or band colors for a gas giant: 2–6. */
  palette: readonly HexColor[];
  /** Water below this height (0–1), or null for a world without seas. */
  seaLevel: number | null;
  /** Deep and shallow water. */
  ocean: readonly [deep: HexColor, shallow: HexColor];
  /** About this many large features around the equator. */
  frequency: number;
  /** Layers of finer detail added on top, each twice as fine and half as strong. */
  octaves: number;
  /** How much the noise bends itself: 0 gives round blobs, 1 swirling continents. */
  warp: number;
  /** Ridged noise: sharp crests (mountain chains, lava cracks) instead of rolling hills. */
  ridged: boolean;
  /** Ice from this share of the way to the poles (0–1), or null for none. */
  polarCaps: number | null;
  /** Gas giants: this many bands from pole to pole, bent by this much turbulence. */
  bands: { count: number; turbulence: number } | null;
  /** What glows on the night side: city lights, or the glow of lava cracks. */
  lights: { kind: 'cities' | 'cracks'; color: HexColor; intensity: number } | null;
}

const hex = (value: string) => value as HexColor;

export const planetPresets: Readonly<Record<PlanetPresetName, PlanetPresetDef>> = {
  barren: {
    label: 'Barren',
    palette: ['#4a443f', '#6e655c', '#8f877d', '#b3aca2'].map(hex),
    seaLevel: null,
    ocean: [hex('#1a2430'), hex('#2a3a4a')],
    frequency: 3,
    octaves: 6,
    warp: 0.2,
    ridged: false,
    polarCaps: null,
    bands: null,
    lights: null,
  },
  desert: {
    label: 'Desert',
    palette: ['#7a4e2a', '#b0773f', '#d39a5c', '#e8c08a'].map(hex),
    seaLevel: null,
    ocean: [hex('#1a2430'), hex('#2a3a4a')],
    frequency: 2.5,
    octaves: 5,
    warp: 0.5,
    ridged: false,
    polarCaps: 0.92,
    bands: null,
    lights: null,
  },
  ice: {
    label: 'Ice',
    palette: ['#9db4c8', '#c7d8e6', '#e8f1f8', '#ffffff'].map(hex),
    seaLevel: 0.35,
    ocean: [hex('#1a3550'), hex('#3a6a8e')],
    frequency: 3,
    octaves: 6,
    warp: 0.3,
    ridged: true,
    polarCaps: 0.55,
    bands: null,
    lights: null,
  },
  ocean: {
    label: 'Ocean',
    palette: ['#3f6b35', '#6b8c45', '#a39a6a', '#e6e6e0'].map(hex),
    seaLevel: 0.58,
    ocean: [hex('#0b2a52'), hex('#1f5f8f')],
    frequency: 2.5,
    octaves: 6,
    warp: 0.6,
    ridged: false,
    polarCaps: 0.85,
    bands: null,
    lights: null,
  },
  jungle: {
    label: 'Jungle',
    palette: ['#173d1b', '#2f6b2a', '#4f8f3a', '#8bb35a'].map(hex),
    seaLevel: 0.4,
    ocean: [hex('#0e3a4a'), hex('#1f6b6e')],
    frequency: 3.5,
    octaves: 6,
    warp: 0.6,
    ridged: false,
    polarCaps: null,
    bands: null,
    lights: null,
  },
  lava: {
    label: 'Lava',
    palette: ['#1a0d0a', '#3a1d14', '#5a2a18', '#2a1410'].map(hex),
    seaLevel: null,
    ocean: [hex('#1a0d0a'), hex('#3a1d14')],
    frequency: 3,
    octaves: 6,
    warp: 0.4,
    ridged: true,
    polarCaps: null,
    bands: null,
    lights: { kind: 'cracks', color: hex('#ff6a1a'), intensity: 1.2 },
  },
  toxic: {
    label: 'Toxic',
    palette: ['#3c4a14', '#6b7a1e', '#a3b02a', '#d8e04a'].map(hex),
    seaLevel: 0.45,
    ocean: [hex('#2a3d0a'), hex('#5a7a12')],
    frequency: 3,
    octaves: 5,
    warp: 0.8,
    ridged: false,
    polarCaps: null,
    bands: null,
    lights: null,
  },
  gas_giant: {
    label: 'Gas giant',
    palette: ['#8c6a4a', '#c9a27a', '#e8d2b0', '#a87a52', '#f0e6d0'].map(hex),
    seaLevel: null,
    ocean: [hex('#1a2430'), hex('#2a3a4a')],
    frequency: 2,
    octaves: 5,
    warp: 0.3,
    ridged: false,
    polarCaps: null,
    bands: { count: 14, turbulence: 0.35 },
    lights: null,
  },
  city: {
    label: 'City (hive)',
    palette: ['#3a3a40', '#55555c', '#6e6e76', '#8a8a92'].map(hex),
    seaLevel: 0.25,
    ocean: [hex('#101820'), hex('#1e2a36')],
    frequency: 3,
    octaves: 6,
    warp: 0.3,
    ridged: false,
    polarCaps: null,
    bands: null,
    lights: { kind: 'cities', color: hex('#ffd27a'), intensity: 1 },
  },
  forge: {
    label: 'Forge',
    palette: ['#2a1d18', '#4a3226', '#6a4632', '#8a5a3e'].map(hex),
    seaLevel: null,
    ocean: [hex('#1a0d0a'), hex('#3a1d14')],
    frequency: 3,
    octaves: 6,
    warp: 0.3,
    ridged: true,
    polarCaps: null,
    bands: null,
    lights: { kind: 'cities', color: hex('#ff7a2a'), intensity: 1.1 },
  },
};

/**
 * Everything the generator needs for one planet's surface: its preset with the object's own
 * overrides applied (palette, sea level, seed, clouds, night lights). Same inputs, same pixels:
 * the bake cache keys on this.
 */
export interface PlanetSurface {
  preset: PlanetPresetName;
  seed: number;
  palette: readonly HexColor[];
  seaLevel: number | null;
  ocean: readonly [HexColor, HexColor];
  frequency: number;
  octaves: number;
  warp: number;
  ridged: boolean;
  polarCaps: number | null;
  bands: { count: number; turbulence: number } | null;
  lights: { kind: 'cities' | 'cracks'; color: HexColor; intensity: number } | null;
  clouds: { coverage: number; color: HexColor } | null;
}

const DEFAULT_CLOUD_COLOR = hex('#ffffff');
const DEFAULT_CLOUD_COVERAGE = 0.5;
const DEFAULT_CITY_LIGHTS = hex('#ffd27a');

/**
 * What a planet's appearance falls back to under a preset (M6-T2): the values the editor shows
 * dimmed until the author sets their own, and the ones the generator uses. The seed has none:
 * each planet's id picks it.
 */
export function planetDefaults(name: PlanetPresetName): PlanetAppearance {
  const preset = planetPresets[name];
  return {
    preset: name,
    texture: 'preset',
    palette: [...preset.palette],
    // A world without seas shows the slider at 0: water below height 0 is no water.
    seaLevel: preset.seaLevel ?? 0,
    axialTiltDeg: 0,
    atmosphere: { enabled: false, color: hex('#9cc8ff'), thickness: 0.08 },
    clouds: { enabled: false, coverage: DEFAULT_CLOUD_COVERAGE, color: DEFAULT_CLOUD_COLOR },
    nightLights: {
      enabled: preset.lights !== null,
      color: preset.lights?.color ?? DEFAULT_CITY_LIGHTS,
      intensity: preset.lights?.intensity ?? 1,
    },
  };
}

/**
 * Resolves an object's planet appearance to its surface. `fallbackSeed` makes planets without a
 * seed of their own differ from each other: callers pass `seedFromId(object.id)`.
 */
export function resolvePlanetSurface(
  planet: PlanetAppearance | undefined,
  fallbackSeed: number,
): PlanetSurface {
  const name: PlanetPresetName = planet?.preset ?? 'barren';
  const preset = planetPresets[name];
  const lights = planet?.nightLights;
  const resolvedLights =
    lights?.enabled === false
      ? null
      : lights?.enabled === true || preset.lights
        ? {
            kind: preset.lights?.kind ?? 'cities',
            color: lights?.color ?? preset.lights?.color ?? DEFAULT_CITY_LIGHTS,
            intensity: lights?.intensity ?? preset.lights?.intensity ?? 1,
          }
        : null;
  const clouds = planet?.clouds;
  return {
    preset: name,
    seed: planet?.seed ?? fallbackSeed,
    palette: planet?.palette ?? preset.palette,
    seaLevel:
      preset.seaLevel === null && planet?.seaLevel === undefined
        ? null
        : (planet?.seaLevel ?? preset.seaLevel),
    ocean: preset.ocean,
    frequency: preset.frequency,
    octaves: preset.octaves,
    warp: preset.warp,
    ridged: preset.ridged,
    polarCaps: preset.polarCaps,
    bands: preset.bands,
    lights: resolvedLights,
    clouds: clouds?.enabled
      ? {
          coverage: clouds.coverage ?? DEFAULT_CLOUD_COVERAGE,
          color: clouds.color ?? DEFAULT_CLOUD_COLOR,
        }
      : null,
  };
}

/** A stable seed from an id (FNV-1a), so a planet looks the same on every load. */
export function seedFromId(id: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash % 1_000_000;
}
