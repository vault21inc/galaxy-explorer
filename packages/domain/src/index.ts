/**
 * @ge/domain: pure TypeScript shared by every package: Zod schemas, registries, rich text,
 * spoiler redaction and geo math. No database, React, three.js or Node built-ins
 * (architecture.md §2), because it runs in the browser too.
 */
export {
  resolveAppearance,
  type ResolvedAppearance,
  type ResolveAppearanceInput,
} from './appearance/resolve.ts';
export { HexColor } from './colors.ts';
export {
  GALAXY_DEFAULTS,
  GALAXY_SHAPE,
  resolveGalaxySettings,
  sampleGalaxyPosition,
  type ResolvedGalaxySettings,
} from './galaxy/density.ts';
export { GALAXY_PRESETS, type GalaxyPreset } from './galaxy/presets.ts';
export {
  areaCentroid,
  chaikin,
  convexHull,
  offsetConvex,
  outlineForGroup,
  type Outline,
  type OutlineOptions,
  type PlanePoint,
} from './geo/outline.ts';
export {
  catmullRom,
  defaultRiftPath,
  distanceToPolyline,
  pointsAlong,
  polylineLength,
  type CurvePoint,
} from './geo/rift.ts';
export { gaussian, seededRandom } from './random.ts';
export { Slug, Uuid } from './ids.ts';
export * from './patterns.ts';
export * from './registry/index.ts';
export * from './richtext/index.ts';
export * from './schemas/index.ts';
export * from './spoilers/index.ts';
export type { Deg, Ly, Px, Radii, Su } from './units.ts';
