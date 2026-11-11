import { describe, expect, it } from 'vitest';
import type { ConfigReadOf, SpoilerPolicy, ViewPin } from '@ge/domain';
import { pinItems } from '@/render/pins/pin-items.ts';
import { PIN_AT_BODY_LAT_DEG, PIN_EVENT_ICON, PIN_PLACE_ICON } from '@/render/tuning.ts';

/** Which pins are drawn, where and how (M6-T4, ux.md §6). */

const HIDE: SpoilerPolicy = { showAll: false, revealed: new Set() };
const SHOW: SpoilerPolicy = { showAll: true, revealed: new Set() };

function pin(id: string, overrides: Partial<ViewPin> = {}): ViewPin {
  return {
    id,
    kind: 'event',
    namePlain: id,
    nameSpoiler: false,
    nameRedacted: id,
    isSpoiler: false,
    status: 'published',
    mode: 'surface',
    latDeg: 10,
    lonDeg: 20,
    placeId: null,
    locationSpoiler: false,
    categoryId: null,
    dateText: null,
    ...overrides,
  } as ViewPin;
}

const battle = {
  id: 'cat-battle',
  name: 'Battle',
  icon: 'game-icons:crossed-swords',
  color: '#e5484d',
} as unknown as ConfigReadOf<'event_categories'>;

describe('pinItems', () => {
  it('gives events their category’s icon and color, and places the place pin', () => {
    const [event, place, bare] = pinItems(
      [
        pin('e', { categoryId: battle.id }),
        pin('p', { kind: 'place', latDeg: -5, lonDeg: 0 }),
        pin('x', { latDeg: 0, lonDeg: 90 }),
      ],
      [battle],
      HIDE,
    );
    expect(event).toMatchObject({ shape: 'event', icon: battle.icon, color: battle.color });
    expect(place).toMatchObject({ shape: 'place', icon: PIN_PLACE_ICON });
    expect(bare?.icon).toBe(PIN_EVENT_ICON);
  });

  it('leaves out a hidden location, and draws it once shown or revealed', () => {
    const hidden = pin('h', { locationSpoiler: true });
    expect(pinItems([hidden], [], HIDE)).toEqual([]);
    expect(pinItems([hidden], [], SHOW)).toHaveLength(1);
    const revealed: SpoilerPolicy = { showAll: false, revealed: new Set(['h/location']) };
    expect(pinItems([hidden], [], revealed)).toHaveLength(1);
  });

  it('redacts a hidden spoiler entity to a grey “?”, and marks drafts', () => {
    const [secret, draft] = pinItems(
      [pin('s', { isSpoiler: true, categoryId: battle.id }), pin('d', { status: 'draft' })],
      [battle],
      HIDE,
    );
    expect(secret).toMatchObject({ state: 'redacted', icon: null });
    expect(draft?.state).toBe('draft');
  });

  it('stands pins at the body in a ring, and fans out pins at the same point', () => {
    const items = pinItems(
      [
        pin('a', { mode: 'object', latDeg: null, lonDeg: null }),
        pin('b', { mode: 'object', latDeg: null, lonDeg: null }),
        pin('c'),
        pin('d'),
      ],
      [],
      HIDE,
    );
    expect(items.map((item) => item.latDeg)).toEqual([
      PIN_AT_BODY_LAT_DEG,
      PIN_AT_BODY_LAT_DEG,
      10,
      10,
    ]);
    expect(items[0]?.lonDeg).toBe(-180);
    expect(items[1]?.lonDeg).toBe(0);
    // The second pin at (10, 20) steps east; on the unit sphere, just above the surface.
    expect(items[2]?.lonDeg).toBe(20);
    expect(items[3]?.lonDeg).toBeGreaterThan(20);
    expect(Math.hypot(...(items[2]?.position ?? [0, 0, 0]))).toBeCloseTo(1.005, 6);
  });
});
