import type { BaseType, ViewLevel, ViewObject } from '@ge/domain';
import type { ComponentType } from 'react';
import { INSTANCED_BODIES, InstancedBodies } from './bodies/instanced-bodies.tsx';
import { BLACK_HOLES, BlackHoles } from './glyphs/black-holes.tsx';
import { ICON_SPRITES, IconSprites } from './glyphs/icon-sprites.tsx';
import { SYSTEM_GLYPHS, SystemGlyphs } from './glyphs/system-glyphs.tsx';
import { REGION_CLOUD, RegionCloud } from './regions/region-cloud.tsx';
import { ASTEROID_BELTS, AsteroidBelts } from './belts/asteroid-belts.tsx';
import { PLANET_BODIES, PlanetBodies } from './planets/planet-bodies.tsx';
import { STAR_BODIES, StarBodies } from './stars/star-bodies.tsx';
import type { RendererProps } from './renderer-types.ts';

/**
 * Which component draws each base type in each view (architecture.md §3.5, rendering.md §4):
 * the extension point for new looks (O3). A renderer draws all of its objects at once, so a
 * view makes one draw call per renderer, not per object. The orbit view adds its entries in M6.
 */
export interface RendererDef {
  /** Stable name: the React key, and the renderer's name in the scene index. */
  name: string;
  component: ComponentType<RendererProps>;
}

const instancedBodies: RendererDef = { name: INSTANCED_BODIES, component: InstancedBodies };
const regionCloud: RendererDef = { name: REGION_CLOUD, component: RegionCloud };
const systemGlyphs: RendererDef = { name: SYSTEM_GLYPHS, component: SystemGlyphs };
const blackHoles: RendererDef = { name: BLACK_HOLES, component: BlackHoles };
const iconSprites: RendererDef = { name: ICON_SPRITES, component: IconSprites };
const starBodies: RendererDef = { name: STAR_BODIES, component: StarBodies };
const planetBodies: RendererDef = { name: PLANET_BODIES, component: PlanetBodies };
const asteroidBelts: RendererDef = { name: ASTEROID_BELTS, component: AsteroidBelts };

type LevelRenderers = Partial<Record<BaseType, RendererDef>> & { default: RendererDef };

export const renderers: Partial<Record<ViewLevel, LevelRenderers>> = {
  // A look per kind of body (D-28): systems, black holes and icons have their own renderers;
  // planets and anything else stay small spheres.
  galaxy: {
    default: instancedBodies,
    system: systemGlyphs,
    black_hole: blackHoles,
    station: iconSprites,
    marker: iconSprites,
    nebula: regionCloud,
    anomaly: regionCloud,
  },
  // Inside a system (rendering.md §7, M5-T3): stars that light it, lit planets, belts of
  // rocks, and icons; anything else (a black hole, say) a small sphere. The orbit rings and
  // the background are the system level's own (levels/system-level.tsx).
  system: {
    default: instancedBodies,
    star: starBodies,
    planet: planetBodies,
    asteroid_belt: asteroidBelts,
    station: iconSprites,
    marker: iconSprites,
  },
};

/** The view's objects grouped by the renderer that draws them, in first-seen order. */
export function partitionByRenderer(
  level: ViewLevel,
  objects: readonly ViewObject[],
): { renderer: RendererDef; objects: ViewObject[] }[] {
  const entries = renderers[level];
  if (!entries) return [];
  const groups = new Map<string, { renderer: RendererDef; objects: ViewObject[] }>();
  for (const object of objects) {
    const renderer = entries[object.baseType] ?? entries.default;
    const group = groups.get(renderer.name) ?? { renderer, objects: [] };
    group.objects.push(object);
    groups.set(renderer.name, group);
  }
  return [...groups.values()];
}
