import { HexColor } from '../colors.ts';
import type { Ly } from '../units.ts';
import { gaussian } from '../random.ts';
import type { GalaxySettings } from '../schemas/map-settings.ts';

/**
 * Where stars are in a galaxy (G1): a bulge at the center, and a thin disc whose stars crowd
 * along logarithmic spiral arms. The background renderer (M2) and the stress seed (M1-T11)
 * both sample positions from here, so seeded content lines up with the drawn galaxy.
 */

/**
 * Every GalaxySettings field but `starPoints` (which the quality setting caps instead), with the
 * defaults data-model §4 names. The colors are this project's choice: a warm core, blue-white
 * arms and brown dust.
 */
export type ResolvedGalaxySettings = Required<Omit<GalaxySettings, 'starPoints'>>;

export const GALAXY_DEFAULTS: ResolvedGalaxySettings = {
  seed: 1,
  radiusLy: 50_000,
  thicknessLy: 1_000,
  arms: 4,
  armTwist: 1.2,
  armSpread: 0.35,
  bulgeRadiusLy: 7_500,
  colors: {
    core: HexColor.parse('#ffd9a0'),
    arm: HexColor.parse('#a9c8ff'),
    dust: HexColor.parse('#3b2a1e'),
  },
};

/**
 * The density's fixed shape parameters. The web app's disc shader mirrors this function in
 * GLSL and reads these, so the baked disc and the sampled stars line up.
 */
export const GALAXY_SHAPE = {
  /** Fraction of stars in the central bulge rather than the disc. */
  bulgeFraction: 0.18,
  /** The disc's density falls off exponentially; the falloff length as a share of the radius. */
  discScaleLength: 0.35,
  /** Arms start curling at this share of the radius (avoids the spiral's singularity at the center). */
  armStart: 0.05,
  /** The bulge's standard deviation as a share of `bulgeRadiusLy`. */
  bulgeSigma: 0.5,
  /** The bulge is a slightly flattened ball: its height is this share of its width. */
  bulgeFlattening: 0.6,
} as const;

export function resolveGalaxySettings(settings: GalaxySettings = {}): ResolvedGalaxySettings {
  const { starPoints: _starPoints, ...rest } = settings;
  return { ...GALAXY_DEFAULTS, ...rest };
}

/**
 * One position, in light-years, in the galaxy frame (X/Z the galactic plane, +Y galactic north;
 * data-model §5).
 */
export function sampleGalaxyPosition(
  settings: ResolvedGalaxySettings,
  random: () => number,
): [Ly, Ly, Ly] {
  const { radiusLy, thicknessLy, arms, armTwist, armSpread, bulgeRadiusLy } = settings;

  if (random() < GALAXY_SHAPE.bulgeFraction) {
    // The bulge: a slightly flattened ball, densest at the center.
    const r = Math.abs(gaussian(random)) * bulgeRadiusLy * GALAXY_SHAPE.bulgeSigma;
    const z = 2 * random() - 1; // even directions over a sphere (see sky-points in apps/web)
    const angle = 2 * Math.PI * random();
    const ring = Math.sqrt(1 - z * z);
    return [
      r * ring * Math.cos(angle),
      r * z * GALAXY_SHAPE.bulgeFlattening,
      r * ring * Math.sin(angle),
    ];
  }

  // The disc: radius drawn from an exponential falloff, cut off at the galaxy's edge.
  let r = radiusLy;
  while (r >= radiusLy) r = -GALAXY_SHAPE.discScaleLength * radiusLy * Math.log(1 - random());

  let angle: number;
  if (arms === 0) {
    angle = 2 * Math.PI * random(); // elliptical: no arms
  } else {
    // A logarithmic spiral turns by the same angle for each doubling of the radius. Normalized
    // so the arm makes `armTwist` turns between `armStart` and the edge.
    const start = GALAXY_SHAPE.armStart * radiusLy;
    const progress = Math.log(1 + r / start) / Math.log(1 + radiusLy / start);
    const arm = Math.floor(random() * arms);
    const scatter = gaussian(random) * armSpread * (Math.PI / arms);
    angle = (arm * 2 * Math.PI) / arms + progress * armTwist * 2 * Math.PI + scatter;
  }
  // Thinner toward the edge, as real discs are.
  const y = gaussian(random) * (thicknessLy / 2) * (1 - 0.5 * (r / radiusLy));
  return [r * Math.cos(angle), y, r * Math.sin(angle)];
}
