import { describe, expect, it } from 'vitest';
import type { HexColor } from '../src/colors.ts';
import { resolveAppearance } from '../src/index.ts';
import { objectTypes } from '../src/registry/index.ts';

const hex = (value: string) => value as HexColor;

describe('resolveAppearance (data-model §6)', () => {
  it('uses the base type defaults when nothing overrides them', () => {
    const { appearance, size } = resolveAppearance({ baseType: 'planet', view: 'system' });
    expect(appearance).toEqual(objectTypes.planet.defaultAppearance);
    expect(size).toBe(0.35);
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
    expect(resolveAppearance({ ...input, view: 'system' }).size).toBe(0.35 * 0.5); // object
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
