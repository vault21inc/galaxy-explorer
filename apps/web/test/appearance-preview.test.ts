import { describe, expect, it } from 'vitest';
import type { Appearance } from '@ge/domain';
import { useAppearancePreview, withPreview } from '@/state/appearance-preview.ts';

/** The live preview of appearance edits (M6-T2). */

describe('withPreview', () => {
  const appearance = {
    color: '#7fa7ff',
    planet: { preset: 'ocean', clouds: { enabled: true, coverage: 0.5 } },
  } as Appearance;

  it('applies previewed paths over the resolved appearance, leaving the rest', () => {
    const result = withPreview(appearance, {
      'appearance.planet.seaLevel': 0.3,
      'appearance.planet.clouds.coverage': 0.8,
    });
    expect(result.planet).toEqual({
      preset: 'ocean',
      seaLevel: 0.3,
      clouds: { enabled: true, coverage: 0.8 },
    });
    expect(result.color).toBe('#7fa7ff');
    // The original isn't touched.
    expect(appearance.planet?.clouds?.coverage).toBe(0.5);
  });

  it('ignores paths outside the appearance, and nothing to preview', () => {
    expect(withPreview(appearance, { name: 'x' })).toEqual(appearance);
    expect(withPreview(appearance, undefined)).toBe(appearance);
  });
});

describe('useAppearancePreview', () => {
  it('keeps values per object and path until each is cleared', () => {
    const store = useAppearancePreview.getState();
    store.show('a', 'appearance.planet.seaLevel', 0.2);
    store.show('a', 'appearance.planet.axialTiltDeg', 10);
    store.show('b', 'appearance.planet.seaLevel', 0.9);
    expect(useAppearancePreview.getState().values.get('a')).toEqual({
      'appearance.planet.seaLevel': 0.2,
      'appearance.planet.axialTiltDeg': 10,
    });
    store.clear('a', 'appearance.planet.seaLevel');
    store.clear('a', 'appearance.planet.axialTiltDeg');
    expect(useAppearancePreview.getState().values.has('a')).toBe(false);
    expect(useAppearancePreview.getState().values.get('b')).toEqual({
      'appearance.planet.seaLevel': 0.9,
    });
    store.clear('b', 'appearance.planet.seaLevel');
  });
});
