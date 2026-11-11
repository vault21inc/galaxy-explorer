import { describe, expect, it } from 'vitest';
import { spoilerKeys, type ConfigReadOf, type SpoilerPolicy, type ViewMarker } from '@ge/domain';
import { markerItems } from '@/render/markers/marker-items.ts';
import { MARKER_BESIDE_PX, MARKER_FAN_PX, PIN_EVENT_ICON } from '@/render/tuning.ts';

/** Which event markers the galaxy and system views draw, where and how (M6-T5). */

const HIDE: SpoilerPolicy = { showAll: false, revealed: new Set() };

function marker(
  id: string,
  overrides: Partial<Omit<ViewMarker, 'objectId'>> & { objectId?: string | null } = {},
): ViewMarker {
  return {
    id,
    kind: 'event',
    version: 1,
    namePlain: id,
    nameSpoiler: false,
    nameRedacted: id,
    isSpoiler: false,
    status: 'published',
    mode: 'space',
    objectId: null,
    position: [1, 2, 3],
    locationSpoiler: false,
    categoryId: null,
    dateText: null,
    ...overrides,
  } as ViewMarker;
}

const battle = {
  id: 'cat-battle',
  icon: 'game-icons:crossed-swords',
  color: '#e5484d',
} as unknown as ConfigReadOf<'event_categories'>;

const positions = new Map([['sys', [10, 0, 20] as const]]);

describe('markerItems', () => {
  it('stands a marker in space at its point, as a diamond in its category’s look', () => {
    const [item] = markerItems([marker('m', { categoryId: battle.id })], positions, [battle], HIDE);
    expect(item).toMatchObject({
      position: [1, 2, 3],
      offsetPx: [0, 0],
      diamond: true,
      icon: battle.icon,
      color: battle.color,
      state: 'normal',
    });
  });

  it('draws markers at an object beside it, in a row, and skips objects the view lacks', () => {
    const items = markerItems(
      [
        marker('a', { mode: 'object', objectId: 'sys', position: null }),
        marker('b', { mode: 'object', objectId: 'sys', position: null }),
        marker('c', { mode: 'object', objectId: 'elsewhere', position: null }),
      ],
      positions,
      [],
      HIDE,
    );
    expect(items.map((item) => [item.id, item.position, item.offsetPx])).toEqual([
      ['a', [10, 0, 20], [MARKER_BESIDE_PX, MARKER_BESIDE_PX]],
      ['b', [10, 0, 20], [MARKER_BESIDE_PX + MARKER_FAN_PX, MARKER_BESIDE_PX]],
    ]);
    expect(items[0]?.icon).toBe(PIN_EVENT_ICON);
  });

  it('hides a spoiler location, and redacts a spoiler event, until shown', () => {
    const markers = [
      marker('where', { locationSpoiler: true }),
      marker('what', { isSpoiler: true }),
    ];
    expect(
      markerItems(markers, positions, [], HIDE).map((item) => [item.id, item.state, item.icon]),
    ).toEqual([['what', 'redacted', null]]);
    const revealed: SpoilerPolicy = {
      showAll: false,
      revealed: new Set([spoilerKeys.location('where')]),
    };
    expect(markerItems(markers, positions, [], revealed).map((item) => item.id)).toEqual([
      'where',
      'what',
    ]);
  });
});
