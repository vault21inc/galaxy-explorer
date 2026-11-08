import { describe, expect, it } from 'vitest';
import {
  GALAXY_DEFAULTS,
  resolveGalaxySettings,
  sampleGalaxyPosition,
} from '../src/galaxy/density.ts';
import { gaussian, seededRandom } from '../src/random.ts';

const sample = (count: number, settings = GALAXY_DEFAULTS, seed = 1) => {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => sampleGalaxyPosition(settings, random));
};

describe('sampleGalaxyPosition', () => {
  it('keeps stars inside the galaxy and near its plane', () => {
    for (const [x, y, z] of sample(5_000)) {
      expect(Math.hypot(x, z)).toBeLessThan(GALAXY_DEFAULTS.radiusLy);
      expect(Math.abs(y)).toBeLessThan(GALAXY_DEFAULTS.bulgeRadiusLy * 2);
    }
  });

  it('crowds stars toward the center', () => {
    const radii = sample(5_000).map(([x, , z]) => Math.hypot(x, z));
    const inner = radii.filter((r) => r < GALAXY_DEFAULTS.radiusLy / 2).length;
    expect(inner / radii.length).toBeGreaterThan(0.7);
  });

  it('gathers disc stars along the arms', () => {
    // With tight arms, angles cluster: most 10° sectors are near-empty, a few are crowded.
    const tight = resolveGalaxySettings({ armSpread: 0.05 });
    const counts = new Array<number>(36).fill(0);
    for (const [x, , z] of sample(5_000, tight)) {
      const r = Math.hypot(x, z);
      if (r < 0.6 * tight.radiusLy || r > 0.7 * tight.radiusLy) continue;
      const sector = Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * 36) % 36;
      counts[sector] = (counts[sector] ?? 0) + 1;
    }
    const empty = counts.filter((count) => count === 0).length;
    expect(empty).toBeGreaterThan(18);
  });

  it('is deterministic for a seed, and differs between seeds', () => {
    expect(sample(100, GALAXY_DEFAULTS, 7)).toEqual(sample(100, GALAXY_DEFAULTS, 7));
    expect(sample(100, GALAXY_DEFAULTS, 8)).not.toEqual(sample(100, GALAXY_DEFAULTS, 7));
  });

  it('spreads an armless galaxy evenly around', () => {
    const elliptical = resolveGalaxySettings({ arms: 0 });
    const left = sample(4_000, elliptical).filter(([x]) => x < 0).length;
    expect(left / 4_000).toBeGreaterThan(0.45);
    expect(left / 4_000).toBeLessThan(0.55);
  });
});

describe('gaussian', () => {
  it('has a mean near 0 and a standard deviation near 1', () => {
    const random = seededRandom(3);
    const values = Array.from({ length: 20_000 }, () => gaussian(random));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
  });
});
