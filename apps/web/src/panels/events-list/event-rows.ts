import {
  isHidden,
  redactionBar,
  spoilerKeys,
  type ConfigReadOf,
  type EventListItem,
  type SpoilerPolicy,
} from '@ge/domain';
import { labelText } from '@/render/labels/label-text.ts';
import { PIN_EVENT_COLOR, PIN_EVENT_ICON } from '@/render/tuning.ts';

/** One row of the events list, as shown. */
export interface EventRow {
  id: string;
  name: string;
  /** The date as written, or null when there's none or it's hidden. */
  date: string | null;
  /** The category's icon and color; null icon for a hidden event ("?"). */
  icon: string | null;
  color: string;
  categoryId: string | null;
  /** "Gudrun › Gudrun I › Hive Primus", "Deep space", "No location", or a redaction bar. */
  where: string;
  located: boolean;
  draft: boolean;
}

/** `'all'`, `'none'` (events without a category) or a category's id. */
export type CategoryFilter = string;

/**
 * The events list's rows, filtered (M6-T7, ux.md §6). Pure, so it's unit-tested. Spoilers:
 * - a hidden event is a redaction bar with no date or category (its pin is a grey "?");
 * - a hidden spoiler location shows a redaction bar where its path would be;
 * - each step of a path follows its own flags, as labels do.
 * The text filter matches only what's shown, so it can't find a hidden name; the category
 * filter leaves out hidden events, whose category is part of what's hidden.
 */
export function eventRows(
  events: readonly EventListItem[],
  categories: readonly ConfigReadOf<'event_categories'>[],
  policy: SpoilerPolicy,
  filter: { text: string; category: CategoryFilter },
): EventRow[] {
  const byId = new Map(categories.map((category) => [category.id as string, category]));
  const needle = filter.text.trim().toLowerCase();
  return events.flatMap((event): EventRow[] => {
    const hidden = isHidden(event.isSpoiler, spoilerKeys.record(event.id), policy);
    const category = hidden || event.categoryId === null ? undefined : byId.get(event.categoryId);
    const row: EventRow = {
      id: event.id,
      name: labelText(event, policy),
      date: hidden ? null : event.dateText,
      icon: hidden ? null : (category?.icon ?? PIN_EVENT_ICON),
      color: category?.color ?? PIN_EVENT_COLOR,
      categoryId: hidden ? null : event.categoryId,
      where: whereOf(event, policy),
      located: event.location !== null,
      draft: event.status === 'draft',
    };
    if (filter.category === 'none' && (hidden || event.categoryId !== null)) return [];
    if (filter.category !== 'all' && filter.category !== 'none') {
      if (row.categoryId !== filter.category) return [];
    }
    if (needle !== '') {
      const shown = [row.name, row.date ?? '', row.where].join(' ').toLowerCase();
      if (!shown.includes(needle)) return [];
    }
    return [row];
  });
}

function whereOf(event: EventListItem, policy: SpoilerPolicy): string {
  const { location } = event;
  if (!location) return 'No location';
  if (isHidden(location.isSpoiler, spoilerKeys.location(event.id), policy)) {
    return redactionBar('Somewhere on the map');
  }
  if (location.path.length === 0) return location.mode === 'space' ? 'Deep space' : '—';
  return location.path.map((step) => labelText(step, policy)).join(' › ');
}
