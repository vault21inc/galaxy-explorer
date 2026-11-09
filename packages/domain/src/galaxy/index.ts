/**
 * `@ge/domain/galaxy`: the galaxy density and seeded randomness alone. Web Workers import this
 * instead of the package root, which also loads the rich-text parsers; one of their
 * dependencies touches `document`, which workers don't have.
 */
export {
  GALAXY_DEFAULTS,
  GALAXY_SHAPE,
  resolveGalaxySettings,
  sampleGalaxyPosition,
  type ResolvedGalaxySettings,
} from './density.ts';
export { GALAXY_PRESETS, type GalaxyPreset } from './presets.ts';
export { gaussian, seededRandom } from '../random.ts';
