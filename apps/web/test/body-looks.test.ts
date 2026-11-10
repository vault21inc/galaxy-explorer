import { HIDE_SPOILERS, SHOW_SPOILERS, type GalaxyObject } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { elevationBlend } from '../src/render/glyphs/black-hole-atlas.ts';
import { buildIconBuffers } from '../src/render/glyphs/icon-sprites.tsx';
import { systemGlyphCell } from '../src/render/glyphs/system-glyph-atlas.ts';
import { buildSystemGlyphBuffers, systemGlyph } from '../src/render/glyphs/system-glyph-buffers.ts';
import { angleOf } from '../src/render/glyphs/use-glyph-quads.ts';
import { REDACTION_COLOR } from '../src/render/tuning.ts';

/** A look per kind of body (D-28, D-29, M4-T8): the pure parts of the three renderers. */

const ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';
function system(extra: Partial<GalaxyObject> = {}): GalaxyObject {
  return {
    id: ID,
    baseType: 'system',
    subtypeId: null,
    namePlain: 'Alpha',
    nameRedacted: 'Alpha',
    nameSpoiler: false,
    isSpoiler: false,
    status: 'published',
    version: 1,
    explorable: true,
    position: [1, 2, 3],
    appearance: { color: '#ffe6a8' },
    size: 120,
    planetCount: 0,
    spoilerPlanetCount: 0,
    stars: [],
    ...extra,
  } as unknown as GalaxyObject;
}

describe('a system’s glyph (D-28, D-29)', () => {
  it('with no star objects, one star in the system’s own color', () => {
    expect(systemGlyph(system({ planetCount: 2 }), HIDE_SPOILERS)).toEqual({
      stars: [{ color: '#ffe6a8', sizeShare: 1 }],
      planets: 2,
    });
  });

  it('its stars, largest first, leaving hidden spoiler stars out', () => {
    const binary = system({
      stars: [
        { color: '#ffd27f', sizeShare: 1, isSpoiler: false },
        { color: '#7fb0ff', sizeShare: 0.6, isSpoiler: true },
      ] as GalaxyObject['stars'],
    });
    expect(systemGlyph(binary, HIDE_SPOILERS).stars).toEqual([{ color: '#ffd27f', sizeShare: 1 }]);
    expect(systemGlyph(binary, SHOW_SPOILERS).stars).toHaveLength(2);
  });

  it('counts spoiler planets only when spoilers show, and at most 6', () => {
    const busy = system({ planetCount: 3, spoilerPlanetCount: 2 });
    expect(systemGlyph(busy, HIDE_SPOILERS).planets).toBe(3);
    expect(systemGlyph(busy, SHOW_SPOILERS).planets).toBe(5);
    expect(systemGlyph(system({ planetCount: 9 }), HIDE_SPOILERS).planets).toBe(6);
  });

  it('a hidden spoiler system gives nothing away: one grey star, no rings', () => {
    const secret = system({
      isSpoiler: true,
      planetCount: 4,
      stars: [{ color: '#ff0000', sizeShare: 1, isSpoiler: false }] as GalaxyObject['stars'],
    });
    expect(systemGlyph(secret, HIDE_SPOILERS)).toEqual({
      stars: [{ color: REDACTION_COLOR, sizeShare: 1 }],
      planets: 0,
    });
    const buffers = buildSystemGlyphBuffers([secret], HIDE_SPOILERS, 'system-glyphs');
    expect(buffers.drawn[0]).toMatchObject({
      state: 'redacted',
      radius: 0,
      color: REDACTION_COLOR,
    });
  });

  it('picks the atlas cell by star and planet count', () => {
    expect(systemGlyphCell(1, 0)).toEqual([0, 0]);
    expect(systemGlyphCell(2, 3)).toEqual([3, 1]);
    expect(systemGlyphCell(3, 6)).toEqual([6, 2]);
    // Clamped to what's baked.
    expect(systemGlyphCell(5, 12)).toEqual([7, 2]);
    expect(systemGlyphCell(0, -1)).toEqual([0, 0]);
  });

  it('publishes the star’s radius and clamp to the scene index, for picking and rings', () => {
    const [drawn] = buildSystemGlyphBuffers([system()], HIDE_SPOILERS, 'system-glyphs').drawn;
    expect(drawn).toMatchObject({ renderer: 'system-glyphs', radius: 120, center: [1, 2, 3] });
  });

  it('turns each glyph by a stable angle from its id', () => {
    expect(angleOf(ID)).toBe(angleOf(ID));
    expect(angleOf(ID)).not.toBe(angleOf(`${ID}x`));
    expect(angleOf(ID)).toBeGreaterThanOrEqual(0);
    expect(angleOf(ID)).toBeLessThan(2 * Math.PI);
  });
});

describe('black holes: the baked elevations to blend', () => {
  it('edge-on uses the first two, from above the last two', () => {
    expect(elevationBlend(0)).toEqual({ first: 0, second: 1, weight: 0 });
    expect(elevationBlend(1)).toMatchObject({ first: 2, second: 3 });
    expect(elevationBlend(1).weight).toBeCloseTo(1);
  });

  it('blends between neighbours in between, the same seen from below the plane', () => {
    const at45 = elevationBlend(Math.sin(Math.PI / 4));
    expect(at45.first).toBe(1);
    expect(at45.weight).toBeCloseTo(0.5);
    expect(elevationBlend(-Math.sin(Math.PI / 4))).toEqual(at45);
  });
});

describe('icons', () => {
  it('stations and markers each get their own cell', () => {
    const station = { ...system(), baseType: 'station' } as unknown as GalaxyObject;
    const marker = { ...system(), id: `${ID}m`, baseType: 'marker' } as unknown as GalaxyObject;
    const buffers = buildIconBuffers([station, marker], HIDE_SPOILERS, 'icon-sprites');
    const cells = buffers.attributes.find((attribute) => attribute.name === 'aCell')?.array;
    expect([...(cells ?? [])]).toEqual([0, 1]);
    expect(buffers.drawn.map((drawn) => drawn.renderer)).toEqual(['icon-sprites', 'icon-sprites']);
  });
});
