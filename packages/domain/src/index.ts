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
export { gaussian, seededRandom } from './random.ts';
export { Slug, Uuid } from './ids.ts';
export * from './patterns.ts';
export * from './registry/index.ts';
export * from './richtext/index.ts';
export * from './schemas/index.ts';
export * from './spoilers/index.ts';
export type { Deg, Ly, Px, Radii, Su } from './units.ts';
