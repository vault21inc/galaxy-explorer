import { unwrap } from '@ge/api-client';
import { entityKinds, rt } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Vector2 } from 'three';
import { api } from '@/api/client.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import type { EditView } from '@/levels/use-edit-view.ts';
import { globeLatLonAt } from '@/render/globe/globe-hit.ts';
import { useEditor, type LocatedKind } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';
import { isClick } from '@/input/click.ts';
import { saveLocation } from '@/panels/location/save-location.ts';
import { toNdc, workPlanePoint } from './work-plane.ts';

/** A location as the API takes it (LocationWrite). */
type NewLocation =
  | { mode: 'surface'; objectId: string; latDeg: number; lonDeg: number }
  | { mode: 'space'; objectId: string | null; x: number; y: number; z: number };

const ndc = new Vector2();

/**
 * Placing a new place or event (M6-T5): after Add ▸ Place or Event, a click puts it there.
 * - In the orbit view, on the globe: the ray from the camera meets the sphere, and the hit
 *   becomes a latitude and longitude on the subject's surface (`surface` mode).
 * - In the galaxy and system views ("Event here"), on the work plane: a point in that view's
 *   frame (`space` mode, in the system's frame, or the galaxy's for deep space).
 *
 * The entity and its location are one batch, so one undo removes both. The new entity is then
 * selected, and its panel opens with the name focused. A right-click or Esc cancels.
 */
export function LocatedPlacement({ view }: { view: EditView }) {
  const placing = useEditor((state) => state.placingLocated);
  // The location editor's "Pick on the globe" or "Pick a point": a new spot for an existing one.
  const picking = useEditor((state) => state.pickingLocation);
  const queryClient = useQueryClient();
  const get = useThree((state) => state.get);
  const create = useCreateLocated(view);
  const { level, edit, subjectId, payload } = view;
  const mode = edit.located.mode;
  const limit = payload ? edit.workPlaneLimit(payload) : 0;

  useEffect(() => {
    if (!placing && !picking) return;
    const canvas = get().gl.domElement;
    let press: { x: number; y: number } | null = null;
    const locationAt = (event: PointerEvent): NewLocation | null => {
      const { camera } = get();
      toNdc(event.clientX, event.clientY, canvas, ndc);
      if (mode === 'surface') {
        const hit = globeLatLonAt(camera, ndc.x, ndc.y);
        return hit ? { mode: 'surface', objectId: subjectId, ...hit } : null;
      }
      const at = workPlanePoint(camera, ndc, 0, limit);
      if (!at) return null;
      // The galaxy view's frame is the galaxy's own (no object); a system view's, its system.
      const frame = level === 'galaxy' ? null : subjectId;
      return { mode: 'space', objectId: frame, x: at[0], y: at[1], z: at[2] };
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        useEditor.getState().cancelPlacing();
        return;
      }
      if (event.button === 0) press = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      const started = press;
      press = null;
      if (event.button !== 0 || !started) return;
      if (!isClick(started, { x: event.clientX, y: event.clientY })) return;
      const location = locationAt(event);
      if (!location) return;
      useEditor.getState().cancelPlacing();
      if (placing) {
        create.mutate({ kind: placing, location });
      } else if (picking) {
        void saveLocation(
          queryClient,
          { id: picking.entityId, namePlain: picking.name },
          { ...location, isSpoiler: picking.isSpoiler },
        );
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.style.cursor = 'crosshair';
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.style.cursor = '';
    };
    // `create.mutate` is stable; listing `create` would rebind on every mutation state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing, picking, get, mode, level, subjectId, limit, queryClient]);

  return null;
}

/** "New place", "New event". */
function defaultName(kind: LocatedKind): string {
  return `New ${entityKinds[kind].label.one.toLowerCase()}`;
}

/** Creates the entity and sets its location, as one batch. */
function useCreateLocated(view: EditView) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, location }: { kind: LocatedKind; location: NewLocation }) => {
      const result = await unwrap(
        api.POST('/api/v1/batch', {
          body: {
            description: `Add ${entityKinds[kind].label.one.toLowerCase()}`,
            operations: [
              {
                op: 'create' as const,
                kind,
                mapId: view.mapId,
                data: { name: rt.plain(defaultName(kind)) },
              },
              { op: 'setLocation' as const, id: '$op:0', data: location },
            ],
          },
        }),
      );
      const created = result.results[0]?.id;
      if (!created) throw new Error('The batch created nothing.');
      return created;
    },
    onError: (error) => {
      useToasts.getState().show(`Couldn't add it: ${errorMessage(error)}`, 'error');
    },
    onSuccess: async (id) => {
      await refreshAfterWrite(queryClient, [['view']]);
      useSelection.getState().select([id]);
      useEditor.getState().setFocusNameOf(id);
    },
  });
}
