import { describe, expect, it } from 'vitest';
import {
  HIDE_SPOILERS,
  SHOW_SPOILERS,
  type ConfigReadOf,
  type EventListItem,
  type LocationStep,
} from '@ge/domain';
import { eventRows } from '@/panels/events-list/event-rows.ts';
import { PIN_EVENT_ICON } from '@/render/tuning.ts';

/** The events list's rows: where, spoilers and filters (M6-T7). */

const step = (id: string, name: string, isSpoiler = false) => ({
  id: id as LocationStep['id'],
  kind: 'celestial_object' as const,
  namePlain: name,
  nameRedacted: name,
  isSpoiler,
  nameSpoiler: false,
});

function event(id: string, overrides: Partial<EventListItem> = {}): EventListItem {
  return {
    id,
    version: 1,
    namePlain: id,
    nameRedacted: id,
    isSpoiler: false,
    nameSpoiler: false,
    status: 'published',
    categoryId: null,
    dateText: null,
    dateSort: null,
    location: {
      mode: 'surface',
      isSpoiler: false,
      path: [step('s', 'Gudrun'), step('p', 'Gudrun I')],
    },
    ...overrides,
  } as EventListItem;
}

const battle = {
  id: 'battle',
  name: 'Battle',
  icon: 'lucide:swords',
  color: '#e5484d',
} as unknown as ConfigReadOf<'event_categories'>;
const ALL = { text: '', category: 'all' };

describe('eventRows', () => {
  it('shows the date, the category’s look and the path of where it is', () => {
    const [row] = eventRows(
      [event('siege', { categoryId: 'battle' as never, dateText: '240.M41' })],
      [battle],
      HIDE_SPOILERS,
      ALL,
    );
    expect(row).toMatchObject({
      name: 'siege',
      date: '240.M41',
      icon: 'lucide:swords',
      color: '#e5484d',
      where: 'Gudrun › Gudrun I',
      located: true,
    });
  });

  it('says deep space, or no location', () => {
    const rows = eventRows(
      [
        event('deep', { location: { mode: 'space', isSpoiler: false, path: [] } }),
        event('nowhere', { location: null }),
      ],
      [],
      HIDE_SPOILERS,
      ALL,
    );
    expect(rows.map((row) => [row.where, row.located, row.icon])).toEqual([
      ['Deep space', true, PIN_EVENT_ICON],
      ['No location', false, PIN_EVENT_ICON],
    ]);
  });

  it('blacks out a hidden event, a hidden location and a hidden step, until shown', () => {
    const events = [
      event('secret', { isSpoiler: true, dateText: '999.M41', categoryId: 'battle' as never }),
      event('where', {
        location: { mode: 'surface', isSpoiler: true, path: [step('p', 'Gudrun I')] },
      }),
      event('step', {
        location: { mode: 'object', isSpoiler: false, path: [step('x', 'Eye', true)] },
      }),
    ];
    const hidden = eventRows(events, [battle], HIDE_SPOILERS, ALL);
    expect(hidden[0]).toMatchObject({ date: null, icon: null, categoryId: null });
    expect(hidden[0]?.name).not.toBe('secret');
    expect(hidden[1]?.where).not.toContain('Gudrun');
    expect(hidden[2]?.where).not.toContain('Eye');
    const shown = eventRows(events, [battle], SHOW_SPOILERS, ALL);
    expect(shown.map((row) => row.where)).toEqual(['Gudrun › Gudrun I', 'Gudrun I', 'Eye']);
  });

  it('filters by category and by shown text only', () => {
    const events = [
      event('Siege', { categoryId: 'battle' as never }),
      event('Founding'),
      event('Hidden battle', { isSpoiler: true, categoryId: 'battle' as never }),
    ];
    const names = (filter: { text: string; category: string }) =>
      eventRows(events, [battle], HIDE_SPOILERS, filter).map((row) => row.id);
    expect(names({ text: '', category: 'battle' })).toEqual(['Siege']);
    expect(names({ text: '', category: 'none' })).toEqual(['Founding']);
    expect(names({ text: 'gudrun i', category: 'all' })).toHaveLength(3);
    // The hidden one's name isn't shown, so it can't be found by it.
    expect(names({ text: 'hidden', category: 'all' })).toEqual([]);
  });
});
