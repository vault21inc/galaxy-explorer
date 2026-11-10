import { describe, expect, it } from 'vitest';
import type { HexColor } from '../src/colors.ts';
import { blackbodyColor, resolveAppearance, type Appearance } from '../src/index.ts';
import { objectTypes } from '../src/registry/index.ts';

const hex = (value: string) => value as HexColor;

describe('resolveAppearance (data-model §6)', () => {
  it('uses the base type defaults when nothing overrides them', () => {
    const { appearance, size } = resolveAppearance({ baseType: 'planet', view: 'system' });
    expect(appearance).toEqual(objectTypes.planet.defaultAppearance);
    expect(size).toBe(0.25);
  });

  it('layers type ← subtype ← object, each field from the highest layer that sets it', () => {
    const { appearance } = resolveAppearance({
      baseType: 'planet',
      subtypeDefaults: {
        color: hex('#aa8844'),
        labelPriority: 6,
        planet: { preset: 'city', seaLevel: 0.2 },
      },
      overrides: { color: hex('#ff0000'), planet: { seaLevel: 0.6 } },
      view: 'orbit',
    });
    expect(appearance.color).toBe('#ff0000'); // object
    expect(appearance.labelPriority).toBe(6); // subtype
    expect(appearance.showOrbit).toBe(true); // type
    expect(appearance.planet).toEqual({ preset: 'city', texture: 'preset', seaLevel: 0.6 }); // all three
  });

  it('merges nested settings field by field and replaces lists whole', () => {
    const { appearance } = resolveAppearance({
      baseType: 'planet',
      subtypeDefaults: {
        planet: {
          palette: [hex('#000000'), hex('#111111'), hex('#222222')],
          atmosphere: { enabled: true, thickness: 0.2 },
        },
      },
      overrides: {
        planet: {
          palette: [hex('#ffffff'), hex('#eeeeee')],
          atmosphere: { color: hex('#88ccff') },
        },
      },
      view: 'orbit',
    });
    expect(appearance.planet?.palette).toEqual(['#ffffff', '#eeeeee']);
    expect(appearance.planet?.atmosphere).toEqual({
      enabled: true,
      thickness: 0.2,
      color: '#88ccff',
    });
  });

  it('scales the size per view, with the highest layer setting each view', () => {
    const input = {
      baseType: 'planet' as const,
      subtypeDefaults: { scale: { galaxy: 2, system: 3 } },
      overrides: { scale: { system: 0.5 } },
    };
    expect(resolveAppearance({ ...input, view: 'galaxy' }).size).toBe(60 * 2); // subtype
    expect(resolveAppearance({ ...input, view: 'system' }).size).toBe(0.25 * 0.5); // object
    expect(resolveAppearance({ ...input, view: 'orbit' }).size).toBe(1); // type, unscaled
  });

  it('has no size where the type is not drawn as a body', () => {
    expect(resolveAppearance({ baseType: 'nebula', view: 'galaxy' }).size).toBeNull();
    expect(resolveAppearance({ baseType: 'system', view: 'orbit' }).size).toBeNull();
  });

  it('does not change its inputs', () => {
    const overrides = { planet: { seaLevel: 0.6 } };
    const before = JSON.stringify(objectTypes.planet.defaultAppearance);
    resolveAppearance({ baseType: 'planet', overrides, view: 'orbit' });
    expect(JSON.stringify(objectTypes.planet.defaultAppearance)).toBe(before);
    expect(overrides).toEqual({ planet: { seaLevel: 0.6 } });
  });
});

describe('star colors from temperature (rendering.md §7)', () => {
  it('follows the blackbody curve: red-orange, warm white, blue-white', () => {
    expect(blackbodyColor(1_500)).toBe('#ff6c00');
    expect(blackbodyColor(1_000)).toBe('#ff6c00');
    expect(blackbodyColor(6_500)).toBe('#fffefa');
    expect(blackbodyColor(90_000)).toBe('#93b6ff');
    // Between samples, interpolated: halfway from 5,500 K to 6,000 K.
    expect(blackbodyColor(5_750)).toBe('#fff2e6');
  });

  it('colors a star by its temperature unless a color is set', () => {
    const star = (overrides: Appearance | null, subtypeDefaults: Appearance | null = null) =>
      resolveAppearance({ baseType: 'star', overrides, subtypeDefaults, view: 'system' }).appearance
        .color;
    expect(star({ star: { temperatureK: 3_000 } })).toBe('#ffb16e');
    expect(star(null)).toBe(blackbodyColor(5_800));
    expect(star({ color: '#123456' as HexColor, star: { temperatureK: 3_000 } })).toBe('#123456');
    expect(star(null, { color: '#654321' as HexColor })).toBe('#654321');
    // Other types keep their color.
    expect(
      resolveAppearance({ baseType: 'planet', overrides: null, view: 'system' }).appearance.color,
    ).toBe('#7fa7ff');
  });
});
