import { describe, expect, it } from 'vitest';
import { generateSkyPoints, seededRandom } from '../src/render/sky-points.ts';

const options = { count: 2_000, radius: 100, minBrightness: 0.3, seed: 7 };

describe('generateSkyPoints', () => {
  it('places every star on the sphere', () => {
    const { positions } = generateSkyPoints(options);
    expect(positions).toHaveLength(options.count * 3);

    for (let i = 0; i < options.count; i++) {
      const length = Math.hypot(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!);
      expect(length).toBeCloseTo(options.radius, 3);
    }
  });

  it('spreads stars evenly: each half of the sphere gets about half', () => {
    const { positions } = generateSkyPoints(options);
    let upper = 0;
    for (let i = 0; i < options.count; i++) if (positions[i * 3 + 1]! > 0) upper++;
    expect(upper / options.count).toBeGreaterThan(0.45);
    expect(upper / options.count).toBeLessThan(0.55);
  });

  it('keeps brightness between the minimum and 1', () => {
    const { colors } = generateSkyPoints(options);
    for (const channel of colors) {
      expect(channel).toBeGreaterThanOrEqual(options.minBrightness * 0.9 - 1e-6);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it('gives the same sky for the same seed', () => {
    expect(generateSkyPoints(options)).toEqual(generateSkyPoints(options));
    expect(generateSkyPoints({ ...options, seed: 8 }).positions).not.toEqual(
      generateSkyPoints(options).positions,
    );
  });
});

describe('seededRandom', () => {
  it('returns numbers in [0, 1)', () => {
    const random = seededRandom(123);
    for (let i = 0; i < 1_000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
