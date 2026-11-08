import { sampleGalaxyPosition, seededRandom, type ResolvedGalaxySettings } from '@ge/domain/galaxy';
import { hexToLinear, mixRgb } from '../color.ts';
import {
  GALAXY_STAR_MIN_BRIGHTNESS,
  GALAXY_STAR_SIZE_RADII,
  GALAXY_STAR_WHITE_MIX,
} from '../tuning.ts';

/**
 * The galaxy's depth stars (rendering.md §6): positions sampled from the same density as the
 * stress seed and the baked disc (`sampleGalaxyPosition`), so the stars, the disc and seeded
 * objects line up. Pure and seeded: the same settings always give the same stars. It runs in a
 * Web Worker (workers/galaxy-points.worker.ts) so 20,000 samples never stall a frame.
 */
export interface GalaxyPoints {
  /** x, y, z per star, in light-years. */
  positions: Float32Array;
  /** Linear r, g, b per star. */
  colors: Float32Array;
  /** Each star's size in light-years; the shader turns it into pixels and caps it. */
  sizesLy: Float32Array;
}

/**
 * The seed is offset from the settings' seed, so the background doesn't replay the exact
 * random sequence the stress seed used for its objects.
 */
const SEED_OFFSET = 0x9e3779b9;

export function generateGalaxyPoints(
  settings: ResolvedGalaxySettings,
  count: number,
): GalaxyPoints {
  const random = seededRandom(settings.seed + SEED_OFFSET);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizesLy = new Float32Array(count);
  const core = hexToLinear(settings.colors.core);
  const arm = hexToLinear(settings.colors.arm);
  const white: [number, number, number] = [1, 1, 1];
  const coreRadiusLy = Math.max(settings.bulgeRadiusLy, 1);

  for (let i = 0; i < count; i++) {
    const [x, y, z] = sampleGalaxyPosition(settings, random);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Warm near the core, the arm color farther out, each nudged toward white so the stars
    // read as stars rather than colored dust.
    const t = Math.min(Math.hypot(x, z) / coreRadiusLy, 1);
    const tint = mixRgb(mixRgb(core, arm, t), white, GALAXY_STAR_WHITE_MIX);
    // Squaring makes dim stars common and bright ones rare.
    const brightness =
      GALAXY_STAR_MIN_BRIGHTNESS + (1 - GALAXY_STAR_MIN_BRIGHTNESS) * random() ** 2;
    colors[i * 3] = tint[0] * brightness;
    colors[i * 3 + 1] = tint[1] * brightness;
    colors[i * 3 + 2] = tint[2] * brightness;

    sizesLy[i] = settings.radiusLy * GALAXY_STAR_SIZE_RADII * (0.5 + random());
  }
  return { positions, colors, sizesLy };
}
