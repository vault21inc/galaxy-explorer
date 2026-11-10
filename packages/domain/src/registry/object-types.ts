import type { HexColor } from '../colors.ts';
import type { Appearance } from '../schemas/appearance.ts';
import type { ViewLevel } from './view-levels.ts';

/**
 * Object base types (architecture.md §3.2). They decide how an object is drawn and where it
 * can live. Universes add subtypes on top ("Hive World"), but not new base types.
 */
export interface ObjectTypeDef {
  label: string;
  /** Allowed parents: other base types, or 'map' for the top level of the galaxy. */
  parents: readonly string[];
  /** The view this type opens, or null if it opens none. */
  explorableAs: ViewLevel | null;
  /**
   * Default size per view, in that view's unit (data-model §6): light-years in the galaxy,
   * system units in a system, body radii in an orbit view. A view without a size doesn't draw
   * this type as a body. Starting points; tune them in M2 and M5.
   */
  size: Partial<Record<ViewLevel, number>>;
  /** Nebulae and anomalies: drawn as a cloud whose radius is in `appearance.region`. */
  region?: true;
  /** Key in the bundled icon set (chosen in M6; Lucide names until then). */
  icon: string;
  /** The bottom layer of `resolveAppearance`. Every type sets at least a color. */
  defaultAppearance: Appearance & { color: HexColor };
}

export function defineObjectTypes<const T extends Record<string, ObjectTypeDef>>(types: T): T {
  return types;
}

const color = (hex: string) => hex as HexColor;

export const objectTypes = defineObjectTypes({
  system: {
    label: 'System',
    parents: ['map'],
    explorableAs: 'system',
    size: { galaxy: 120 },
    icon: 'sun',
    defaultAppearance: { color: color('#ffe6a8'), labelPriority: 5 },
  },
  star: {
    label: 'Star',
    parents: ['system'],
    explorableAs: null,
    size: { system: 1 },
    icon: 'sun',
    defaultAppearance: { color: color('#ffd27f'), star: { temperatureK: 5_800, glow: 1 } },
  },
  planet: {
    label: 'Planet',
    parents: ['system', 'map'],
    explorableAs: 'orbit',
    size: { galaxy: 60, system: 0.35, orbit: 1 },
    icon: 'globe',
    defaultAppearance: {
      color: color('#7fa7ff'),
      labelPriority: 3,
      showOrbit: true,
      planet: { preset: 'barren', texture: 'preset' },
    },
  },
  moon: {
    label: 'Moon',
    parents: ['planet'],
    explorableAs: 'orbit',
    size: { orbit: 0.27 },
    icon: 'moon',
    defaultAppearance: {
      color: color('#c9ccd3'),
      labelPriority: 2,
      showOrbit: true,
      planet: { preset: 'barren', texture: 'preset' },
    },
  },
  asteroid_belt: {
    label: 'Asteroid belt',
    parents: ['system'],
    explorableAs: null,
    size: { system: 1 },
    icon: 'circle-dashed',
    defaultAppearance: { color: color('#a39380') },
  },
  station: {
    label: 'Station',
    parents: ['map', 'system', 'planet', 'moon'],
    explorableAs: null,
    size: { galaxy: 40, system: 0.08, orbit: 0.05 },
    icon: 'satellite',
    defaultAppearance: { color: color('#9fe0ff'), labelPriority: 2 },
  },
  nebula: {
    label: 'Nebula',
    parents: ['map'],
    explorableAs: null,
    size: {},
    region: true,
    icon: 'cloud',
    defaultAppearance: {
      color: color('#7a5cff'),
      region: {
        radius: 1_500,
        shape: 'sphere',
        density: 0.5,
        color: color('#7a5cff'),
        // What a storm-shaped nebula starts from (M4-T6).
        innerRadius: 0.45,
        rimColor: color('#c9b8ff'),
        filaments: 0.5,
        texture: 'procedural',
        rotationDeg: 0,
      },
    },
  },
  anomaly: {
    label: 'Anomaly',
    parents: ['map', 'system'],
    explorableAs: null,
    size: {},
    region: true,
    icon: 'tornado',
    defaultAppearance: {
      color: color('#ff4f8b'),
      region: {
        radius: 1_000,
        shape: 'sphere',
        density: 0.6,
        color: color('#ff4f8b'),
        // What a warp storm starts from (M4-T6): a dark core inside a bright rim.
        innerRadius: 0.45,
        rimColor: color('#ffb3cf'),
        filaments: 0.6,
        texture: 'procedural',
        rotationDeg: 0,
      },
    },
  },
  black_hole: {
    label: 'Black hole',
    parents: ['map', 'system'],
    explorableAs: null,
    size: { galaxy: 80, system: 0.5 },
    icon: 'circle-dot',
    defaultAppearance: { color: color('#ff9f43') },
  },
  marker: {
    label: 'Marker',
    parents: ['map', 'system', 'planet', 'moon'],
    explorableAs: null,
    size: { galaxy: 30, system: 0.05, orbit: 0.03 },
    icon: 'map-pin',
    defaultAppearance: { color: color('#4fd1ff') },
  },
});

export type BaseType = keyof typeof objectTypes;

/** The base type names in registry order, as a tuple Zod can use. */
export const BASE_TYPES = Object.keys(objectTypes) as [BaseType, ...BaseType[]];

/** Whether a base type is drawn as a region, a cloud with its radius in `appearance.region`. */
export function isRegionType(baseType: BaseType): boolean {
  const type: ObjectTypeDef = objectTypes[baseType];
  return type.region === true;
}
