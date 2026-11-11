import {
  isHidden,
  spoilerKeys,
  type ConfigReadOf,
  type SpoilerPolicy,
  type ViewMarker,
} from '@ge/domain';
import type { BillboardItem } from '../pins/billboards.tsx';
import { MARKER_BESIDE_PX, MARKER_FAN_PX, PIN_EVENT_COLOR, PIN_EVENT_ICON } from '../tuning.ts';

/** One event marker as drawn. */
export interface MarkerItem extends BillboardItem {
  marker: ViewMarker;
}

/**
 * Which of a galaxy or system view's event markers to draw, where and how (M6-T5, E3). Pure, so
 * it's unit-tested. As with pins (pin-items.ts):
 * - a marker whose **location** is a hidden spoiler isn't drawn at all;
 * - one whose **event** is a hidden spoiler is grey with "?"; a draft is faded;
 * - each takes its category's icon and color, as a diamond.
 *
 * A marker in space stands at its point. One at an object stands at that object's center,
 * drawn MARKER_BESIDE_PX right of and above it on screen (so it doesn't cover the object's
 * glyph); several at one object line up to the right. One at an object the view doesn't show
 * isn't drawn.
 */
export function markerItems(
  markers: readonly ViewMarker[],
  /** The view's objects' positions, by id. */
  positions: ReadonlyMap<string, readonly [number, number, number]>,
  categories: readonly ConfigReadOf<'event_categories'>[],
  policy: SpoilerPolicy,
): MarkerItem[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const atObject = new Map<string, number>();
  const items: MarkerItem[] = [];
  for (const marker of markers) {
    if (isHidden(marker.locationSpoiler, spoilerKeys.location(marker.id), policy)) continue;
    let position: readonly [number, number, number] | undefined;
    let offsetPx: [number, number] = [0, 0];
    if (marker.mode === 'space') {
      position = marker.position ?? undefined;
    } else if (marker.objectId !== null) {
      position = positions.get(marker.objectId);
      const nth = atObject.get(marker.objectId) ?? 0;
      atObject.set(marker.objectId, nth + 1);
      offsetPx = [MARKER_BESIDE_PX + nth * MARKER_FAN_PX, MARKER_BESIDE_PX];
    }
    if (!position) continue;
    const redacted = isHidden(marker.isSpoiler, spoilerKeys.record(marker.id), policy);
    const category = marker.categoryId === null ? undefined : byId.get(marker.categoryId);
    items.push({
      id: marker.id,
      position,
      diamond: true,
      icon: redacted ? null : (category?.icon ?? PIN_EVENT_ICON),
      color: category?.color ?? PIN_EVENT_COLOR,
      state: redacted ? 'redacted' : marker.status === 'draft' ? 'draft' : 'normal',
      offsetPx,
      marker,
    });
  }
  return items;
}
