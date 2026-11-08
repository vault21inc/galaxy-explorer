import { seededRandom } from '@ge/domain';

/**
 * Generates the placeholder sky: star positions spread evenly over a sphere, and a brightness
 * per star. Pure functions, so they're unit-tested and run once per load, not per frame.
 */

export interface SkyPoints {
  /** x, y, z for each star, in scene units: the layout three.js expects for a position buffer. */
  positions: Float32Array;
  /** r, g, b for each star, from 0 to 1. */
  colors: Float32Array;
}

export interface SkyOptions {
  count: number;
  radius: number;
  minBrightness: number;
  seed: number;
}

export function generateSkyPoints({ count, radius, minBrightness, seed }: SkyOptions): SkyPoints {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // An even spread over a sphere. Picking two angles uniformly would bunch stars at the
    // poles. Instead pick the height z uniformly in [-1, 1] and an angle around the axis:
    // by Archimedes' hat-box theorem, equal bands of height have equal area on a sphere.
    const z = 2 * random() - 1;
    const angle = 2 * Math.PI * random();
    const ringRadius = Math.sqrt(1 - z * z);
    positions[i * 3] = radius * ringRadius * Math.cos(angle);
    positions[i * 3 + 1] = radius * z;
    positions[i * 3 + 2] = radius * ringRadius * Math.sin(angle);

    // Squaring makes dim stars common and bright ones rare, like a real sky. A slight blue
    // tint keeps white stars from looking flat.
    const t = random() ** 2;
    const brightness = minBrightness + (1 - minBrightness) * t;
    colors[i * 3] = brightness * 0.9;
    colors[i * 3 + 1] = brightness * 0.95;
    colors[i * 3 + 2] = brightness;
  }

  return { positions, colors };
}
