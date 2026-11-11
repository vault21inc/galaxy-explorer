import type { ViewPin } from '@ge/domain';
import { useCallback, useEffect, useMemo } from 'react';
import { useConfigList } from '@/api/hooks.ts';
import { usePinPreview } from '@/state/pin-preview.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { labelText } from '../labels/label-text.ts';
import type { DrawnObject } from '../scene-index.ts';
import { PIN_RADIUS_PX, PIN_TOWARD_CAMERA_RADII } from '../tuning.ts';
import { Billboards } from './billboards.tsx';
import { pinItems, type PinItem } from './pin-items.ts';

export const PINS = 'pins';

/** What each pin draws, for the test hooks and the pin drag. */
let drawnPins = new Map<string, PinItem>();
export function pinOf(id: string): PinItem | null {
  return drawnPins.get(id) ?? null;
}

/**
 * Pins for places and events on the orbit view's globe (rendering.md §8, M6-T4): icon
 * billboards (billboards.tsx), PIN_RADIUS_PX on screen. A place is a diamond, an event a round
 * head, in its category's color and icon.
 *
 * It sits inside the globe's turning group (globe.tsx), so pins tilt and turn with the surface.
 * The globe hides the pins on its far side by the ordinary depth test. The scene index (picking,
 * hover labels, selection rings) holds every pin marked as lying on the globe (`onSphere`), so
 * the picker leaves out those on the far side.
 */
export function Pins({ pins, universeId }: { pins: readonly ViewPin[]; universeId: string }) {
  const policy = useSpoilerPolicy();
  const categories = useConfigList('event_categories', universeId).data;
  const preview = usePinPreview((state) => state.preview);
  const items = useMemo(
    () => pinItems(pins, categories ?? [], policy, preview),
    [pins, categories, policy, preview],
  );
  useEffect(() => {
    drawnPins = new Map(items.map((item) => [item.id, item]));
  }, [items]);
  useEffect(
    () => () => {
      drawnPins = new Map();
    },
    [],
  );
  const drawn = useCallback(
    (item: PinItem, center: [number, number, number]): DrawnObject => ({
      id: item.id,
      renderer: PINS,
      center,
      radius: 0,
      minRadiusPx: PIN_RADIUS_PX,
      maxRadiusPx: PIN_RADIUS_PX,
      state: item.state,
      color: item.color,
      // Above the moons: a pin is what the pointer is on when they overlap.
      pickPriority: 1.1,
      label: labelText(item.pin, policy),
      labelPriority: 5,
      onSphere: { center: [0, 0, 0], radius: 1 },
    }),
    [policy],
  );
  return (
    <Billboards
      name={PINS}
      items={items}
      radiusPx={PIN_RADIUS_PX}
      towardCamera={PIN_TOWARD_CAMERA_RADII}
      drawn={drawn}
    />
  );
}
