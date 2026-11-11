import { useThree } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Vector2 } from 'three';
import { isClick } from '@/input/click.ts';
import type { EditView } from '@/levels/use-edit-view.ts';
import { saveLocation } from '@/panels/location/save-location.ts';
import { globeLatLonAt } from '@/render/globe/globe-hit.ts';
import { pickAt } from '@/render/picking/picking.ts';
import { PINS, pinOf } from '@/render/pins/pins.tsx';
import { toolOwnsClicks, useEditor } from '@/state/editor.ts';
import { usePinPreview } from '@/state/pin-preview.ts';
import { useSelection } from '@/state/selection.ts';
import { toNdc } from './work-plane.ts';

const ndc = new Vector2();

/**
 * Dragging a pin across the globe in edit mode (M6-T5). The pin follows the point under the
 * pointer on the sphere (globe-hit.ts); a place takes the events located at it along
 * (pin-items.ts). Letting go saves the new latitude and longitude as one change.
 *
 * Only pins on the surface move this way: an event at a place moves with its place, and one at
 * the body has no spot to move (the panel's location editor changes either).
 */
export function PinDrag({ view }: { view: EditView }) {
  const editing = useEditor((state) => state.editing);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const queryClient = useQueryClient();
  const { subjectId, level } = view;

  useEffect(() => {
    if (!editing || level !== 'orbit') return;
    const canvas = get().gl.domElement;
    let drag: {
      pointerId: number;
      start: { x: number; y: number };
      id: string;
      name: string;
      isSpoiler: boolean;
      moved: boolean;
    } | null = null;

    const latLonAt = (event: PointerEvent) => {
      toNdc(event.clientX, event.clientY, canvas, ndc);
      return globeLatLonAt(get().camera, ndc.x, ndc.y);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || toolOwnsClicks()) return;
      const hit = pickAt(get(), event.clientX, event.clientY);
      if (hit?.renderer !== PINS) return;
      const item = pinOf(hit.id);
      if (item?.pin.mode !== 'surface') return;
      drag = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        id: item.id,
        name: item.pin.namePlain,
        isSpoiler: item.pin.locationSpoiler,
        moved: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      if (!drag.moved) {
        if (isClick(drag.start, { x: event.clientX, y: event.clientY })) return;
        drag.moved = true;
        useSelection.getState().select([drag.id]);
      }
      // Off the globe, the pin stays where it last was.
      const at = latLonAt(event);
      if (!at) return;
      usePinPreview.getState().show({ id: drag.id, ...at });
      invalidate();
    };
    const onPointerUp = (event: PointerEvent) => {
      const current = drag;
      drag = null;
      if (current?.pointerId !== event.pointerId || !current.moved) return;
      const to = usePinPreview.getState().preview;
      if (to?.id !== current.id) return;
      void saveLocation(
        queryClient,
        { id: current.id, namePlain: current.name },
        {
          mode: 'surface',
          objectId: subjectId,
          latDeg: to.latDeg,
          lonDeg: to.lonDeg,
          isSpoiler: current.isSpoiler,
        },
        `Move “${current.name}”`,
      ).finally(() => {
        usePinPreview.getState().clear();
        invalidate();
      });
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      usePinPreview.getState().clear();
    };
  }, [editing, level, subjectId, get, invalidate, queryClient]);

  return null;
}
