import type { ViewMarker, ViewObject } from '@ge/domain';
import { useCallback, useEffect, useMemo } from 'react';
import { useConfigList } from '@/api/hooks.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { labelText } from '../labels/label-text.ts';
import { Billboards } from '../pins/billboards.tsx';
import type { DrawnObject } from '../scene-index.ts';
import { MARKER_RADIUS_PX } from '../tuning.ts';
import { markerItems, type MarkerItem } from './marker-items.ts';

export const EVENT_MARKERS = 'event-markers';

/** What each marker draws, for the test hooks. */
let drawnMarkers = new Map<string, MarkerItem>();
export function markerOf(id: string): MarkerItem | null {
  return drawnMarkers.get(id) ?? null;
}

/**
 * Event markers in the galaxy and system views (E3, M6-T5, rendering.md §8): events in space,
 * or at a system or deep-space object, as small diamond icon billboards in the view's frame,
 * drawn by the same instanced billboards as a globe's pins (pins/billboards.tsx). One draw call
 * for all of them. They're picked, labelled and ringed like any object, and selecting one opens
 * the event's panel.
 */
export function EventMarkers({
  markers,
  objects,
  universeId,
}: {
  markers: readonly ViewMarker[];
  objects: readonly ViewObject[];
  universeId: string;
}) {
  const policy = useSpoilerPolicy();
  const categories = useConfigList('event_categories', universeId).data;
  const positions = useMemo(
    () => new Map(objects.map((object) => [object.id, object.position] as const)),
    [objects],
  );
  const items = useMemo(
    () => markerItems(markers, positions, categories ?? [], policy),
    [markers, positions, categories, policy],
  );
  useEffect(() => {
    drawnMarkers = new Map(items.map((item) => [item.id, item]));
  }, [items]);
  useEffect(
    () => () => {
      drawnMarkers = new Map();
    },
    [],
  );
  const drawn = useCallback(
    (item: MarkerItem, center: [number, number, number]): DrawnObject => ({
      id: item.id,
      renderer: EVENT_MARKERS,
      center,
      radius: 0,
      minRadiusPx: MARKER_RADIUS_PX,
      maxRadiusPx: MARKER_RADIUS_PX,
      state: item.state,
      color: item.color,
      // Above the bodies, which a marker in space may sit in front of.
      pickPriority: 1.1,
      label: labelText(item.marker, policy),
      labelPriority: 4,
      offsetPx: item.offsetPx,
    }),
    [policy],
  );
  return (
    <Billboards name={EVENT_MARKERS} items={items} radiusPx={MARKER_RADIUS_PX} drawn={drawn} />
  );
}
