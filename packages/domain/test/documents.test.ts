import { describe, expect, it } from 'vitest';
import { rt } from '../src/richtext/index.ts';
import {
  Appearance,
  FIELD_VALUE_TYPES,
  FieldValue,
  GalaxySettings,
  GroupStyle,
  Underlay,
  UniverseSettings,
} from '../src/schemas/index.ts';

describe('document schemas (data-model §4)', () => {
  it('accept a full appearance, and an empty one (sparse overrides)', () => {
    expect(Appearance.safeParse({}).success).toBe(true);
    const full = {
      color: '#7fa7ff',
      scale: { galaxy: 2, orbit: 0.5 },
      labelPriority: 7,
      showOrbit: false,
      star: { temperatureK: 3_000 },
      planet: {
        preset: 'ocean',
        palette: ['#001133', '#2266aa'],
        atmosphere: { enabled: true, thickness: 0.1 },
        rings: { enabled: true, innerRadius: 1.4, outerRadius: 2.2 },
      },
      region: { radius: 900, shape: 'disc' },
    };
    expect(Appearance.parse(full)).toEqual(full);
  });

  it.each([
    ['an upper-case color', { color: '#7FA7FF' }],
    ['a scale for an unknown view', { scale: { surface: 2 } }],
    ['a scale out of range', { scale: { galaxy: 50 } }],
    ['an unknown planet preset', { planet: { preset: 'candy' } }],
    ['a one-color palette', { planet: { palette: ['#000000'] } }],
    ['a fractional label priority', { labelPriority: 2.5 }],
  ])('reject %s', (_label, value) => {
    expect(Appearance.safeParse(value).success).toBe(false);
  });

  it('bound the galaxy settings', () => {
    expect(GalaxySettings.safeParse({ radiusLy: 50_000, arms: 4 }).success).toBe(true);
    expect(GalaxySettings.safeParse({ arms: 9 }).success).toBe(false);
    expect(GalaxySettings.safeParse({ radiusLy: 10 }).success).toBe(false);
  });

  it('require every underlay field', () => {
    const underlay = {
      widthLy: 100_000,
      rotationDeg: 0,
      offsetX: 0,
      offsetZ: 0,
      opacity: 0.5,
      visible: true,
    };
    expect(Underlay.safeParse(underlay).success).toBe(true);
    expect(Underlay.safeParse({ ...underlay, visible: undefined }).success).toBe(false);
  });

  it('bound group styles and universe settings', () => {
    expect(GroupStyle.safeParse({ fillOpacity: 0.06, lineWidthPx: 2 }).success).toBe(true);
    expect(GroupStyle.safeParse({ fillOpacity: 0.9 }).success).toBe(false);
    expect(
      UniverseSettings.safeParse({ accentColor: '#c8a24a', distanceUnitLabels: { galaxy: 'ly' } })
        .success,
    ).toBe(true);
  });

  it('type fact values by their discriminator', () => {
    expect(FIELD_VALUE_TYPES).toEqual(['text', 'number', 'date_text', 'url']);
    expect(FieldValue.safeParse({ type: 'text', text: rt.md('**5** billion') }).success).toBe(true);
    expect(FieldValue.safeParse({ type: 'number', number: 5e9 }).success).toBe(true);
    expect(FieldValue.safeParse({ type: 'date_text', text: '240.M41', sort: 240 }).success).toBe(
      true,
    );
    expect(FieldValue.safeParse({ type: 'url', url: 'https://example.com' }).success).toBe(true);
    expect(FieldValue.safeParse({ type: 'url', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(FieldValue.safeParse({ type: 'number', number: '5' }).success).toBe(false);
  });
});
