import { describe, expect, it } from 'vitest';
import {
  PLANET_PRESETS,
  PlanetAppearance,
  planetDefaults,
  planetPresets,
  resolvePlanetSurface,
  seedFromId,
} from '../src/index.ts';

/** Planet presets as data (M6-T2, rendering.md §9). */

describe('planet presets', () => {
  it('cover every preset name, with 2–6 palette colors and sane numbers', () => {
    expect(Object.keys(planetPresets).sort()).toEqual([...PLANET_PRESETS].sort());
    for (const name of PLANET_PRESETS) {
      const preset = planetPresets[name];
      expect(preset.palette.length, name).toBeGreaterThanOrEqual(2);
      expect(preset.palette.length, name).toBeLessThanOrEqual(6);
      expect(preset.octaves, name).toBeGreaterThanOrEqual(1);
      expect(preset.octaves, name).toBeLessThanOrEqual(8);
      if (preset.seaLevel !== null) expect(preset.seaLevel).toBeGreaterThan(0);
    }
    // Only gas giants are banded; hive and forge worlds glow at night.
    expect(PLANET_PRESETS.filter((name) => planetPresets[name].bands)).toEqual(['gas_giant']);
    expect(planetPresets.city.lights?.kind).toBe('cities');
    expect(planetPresets.forge.lights?.kind).toBe('cities');
    expect(planetPresets.lava.lights?.kind).toBe('cracks');
  });

  it('give defaults the appearance schema accepts', () => {
    for (const name of PLANET_PRESETS) {
      expect(PlanetAppearance.safeParse(planetDefaults(name)).success, name).toBe(true);
    }
    expect(planetDefaults('city').nightLights?.enabled).toBe(true);
    expect(planetDefaults('ocean').nightLights?.enabled).toBe(false);
    expect(planetDefaults('ocean').seaLevel).toBe(planetPresets.ocean.seaLevel);
  });
});

describe('resolvePlanetSurface', () => {
  it('starts from the preset and applies the overrides', () => {
    const plain = resolvePlanetSurface({ preset: 'jungle' }, 11);
    expect(plain).toMatchObject({
      preset: 'jungle',
      seed: 11,
      palette: planetPresets.jungle.palette,
      seaLevel: planetPresets.jungle.seaLevel,
      clouds: null,
      lights: null,
    });
    const custom = resolvePlanetSurface(
      PlanetAppearance.parse({
        preset: 'jungle',
        seed: 3,
        palette: ['#000000', '#ffffff'],
        seaLevel: 0.2,
        clouds: { enabled: true },
        nightLights: { enabled: true, intensity: 1.5 },
      }),
      11,
    );
    expect(custom).toMatchObject({
      seed: 3,
      palette: ['#000000', '#ffffff'],
      seaLevel: 0.2,
      clouds: { coverage: 0.5, color: '#ffffff' },
      lights: { kind: 'cities', intensity: 1.5 },
    });
  });

  it('gives a world without seas one only when asked, and lets lights be switched off', () => {
    expect(resolvePlanetSurface({ preset: 'desert' }, 1).seaLevel).toBeNull();
    expect(resolvePlanetSurface({ preset: 'desert', seaLevel: 0.3 }, 1).seaLevel).toBe(0.3);
    expect(resolvePlanetSurface({ preset: 'city' }, 1).lights).not.toBeNull();
    expect(
      resolvePlanetSurface({ preset: 'city', nightLights: { enabled: false } }, 1).lights,
    ).toBeNull();
  });

  it('falls back to a barren world', () => {
    expect(resolvePlanetSurface(undefined, 9)).toMatchObject({ preset: 'barren', seed: 9 });
  });
});

describe('seedFromId', () => {
  it('is stable, under a million, and differs between ids', () => {
    const a = seedFromId('01a1bb71-7780-70fb-a2e5-d351a1857cfa');
    expect(seedFromId('01a1bb71-7780-70fb-a2e5-d351a1857cfa')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1_000_000);
    expect(seedFromId('01a1bb71-7780-70fb-a2e5-d351a1857cfb')).not.toBe(a);
  });
});
