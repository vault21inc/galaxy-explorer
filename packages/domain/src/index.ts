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
export { blackbodyColor } from './appearance/blackbody.ts';
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
  fanFill,
  offsetConvex,
  outlineForGroup,
  type GroupFigure,
  type Outline,
  type OutlineOptions,
  type PlanePoint,
} from './geo/outline.ts';
export { ringForGroup, type Ring, type RingOptions } from './geo/ring.ts';
export {
  catmullRom,
  defaultRiftPath,
  distanceToPolyline,
  pointsAlong,
  polylineLength,
  type CurvePoint,
} from './geo/rift.ts';
export {
  greatCircleDistanceRad,
  latLonToUnitVector,
  latLonToUv,
  normalizeLonDeg,
  raySphereIntersect,
  slerpLatLon,
  unitVectorToLatLon,
  uvToLatLon,
  type LatLon,
} from './geo/latlon.ts';
export {
  planetDefaults,
  planetPresets,
  resolvePlanetSurface,
  seedFromId,
  type PlanetPresetDef,
  type PlanetPresetName,
  type PlanetSurface,
} from './planet-presets.ts';
export { gaussian, seededRandom } from './random.ts';
export { Slug, Uuid } from './ids.ts';
export * from './export/index.ts';
export * from './link-preview.ts';
export * from './patterns.ts';
export * from './registry/index.ts';
export * from './richtext/index.ts';
export * from './schemas/index.ts';
export * from './search/index.ts';
export * from './spoilers/index.ts';
export * from './wiki/index.ts';
export type { Deg, Ly, Px, Radii, Su } from './units.ts';
export {
  ICON_CREDITS,
  ICON_KEY_PATTERN,
  ICON_SET_LABELS,
  ICON_SETS,
  IconKey,
  IconSummary,
  IconSvg,
  iconKey,
  parseIconKey,
  type IconSet,
} from './icons.ts';
