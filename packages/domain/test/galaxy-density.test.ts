import { describe, expect, it } from 'vitest';
import {
  GALAXY_DEFAULTS,
  resolveGalaxySettings,
  sampleGalaxyPosition,
} from '../src/galaxy/density.ts';
import { GALAXY_PRESETS } from '../src/galaxy/presets.ts';
import { gaussian, seededRandom } from '../src/random.ts';
import { GalaxySettings } from '../src/schemas/map-settings.ts';

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

describe('the central bar (D-24)', () => {
  /**
   * FNV-1a over the first 1,000 positions as 32-bit floats: any real change changes the hash.
   * Not 64-bit: the last bits of Math.log and Math.cos differ between platforms (macOS and the
   * Linux CI), which 32-bit rounding hides, as in the web app's pinned point hash.
   */
  const hashOf = (settings: ReturnType<typeof resolveGalaxySettings>, seed: number) => {
    const values = new Float32Array(sample(1_000, settings, seed).flat());
    let hash = 0x811c9dc5;
    for (const word of new Uint32Array(values.buffer)) {
      hash ^= word;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };

  it('without a bar, the sampler draws exactly what it drew before bars existed', () => {
    // Pinned before the bar was added: existing maps and the stress seed stay as they were.
    expect(hashOf(GALAXY_DEFAULTS, 1)).toBe('00235d92');
    expect(hashOf(resolveGalaxySettings({ arms: 0, seed: 5 }), 5)).toBe('948101d8');
    expect(hashOf(resolveGalaxySettings({ arms: 2, armTwist: 0.6 }), 9)).toBe('f7990c4b');
  });

  it('puts stars along the X axis near the center', () => {
    const barred = resolveGalaxySettings({ barLengthRadii: 0.3, arms: 2 });
    const plain = resolveGalaxySettings({ arms: 2 });
    // Of the stars within the bar's length of the center, outside the bulge's core, the share
    // closer to the X axis than to the Z axis: about half without a bar, far more with one.
    const alongX = (settings: typeof barred) => {
      const reach = 0.3 * settings.radiusLy;
      const near = sample(20_000, settings).filter(([x, , z]) => {
        const r = Math.hypot(x, z);
        return r > settings.bulgeRadiusLy * 0.5 && r < reach;
      });
      return near.filter(([x, , z]) => Math.abs(x) > Math.abs(z)).length / near.length;
    };
    expect(alongX(plain)).toBeLessThan(0.6);
    expect(alongX(barred)).toBeGreaterThan(0.75);
  });
});

describe('presets', () => {
  it.each(GALAXY_PRESETS.map((preset) => [preset.label, preset] as const))(
    '%s parses as GalaxySettings and resolves to a full shape',
    (_label, preset) => {
      expect(GalaxySettings.parse(preset.settings)).toEqual(preset.settings);
      expect(Object.keys(resolveGalaxySettings(preset.settings)).sort()).toEqual(
        Object.keys(GALAXY_DEFAULTS).sort(),
      );
    },
  );

  it('have unique ids, and the first is the defaults', () => {
    expect(new Set(GALAXY_PRESETS.map((preset) => preset.id)).size).toBe(GALAXY_PRESETS.length);
    const first = resolveGalaxySettings(GALAXY_PRESETS[0]?.settings);
    expect(first).toEqual(GALAXY_DEFAULTS);
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
