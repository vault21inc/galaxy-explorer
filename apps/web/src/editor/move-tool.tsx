import { TransformControls } from '@react-three/drei';
import type { GalaxyView } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Vector2, type Group } from 'three';
import { queryKeys } from '@/api/keys.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { resolveBinding } from '@/input/bindings.ts';
import { isClick } from '@/input/click.ts';
import { detectPlatform } from '@/input/platform.ts';
import { pickAt } from '@/render/picking/picking.ts';
import {
  drawnObject,
  movePreview,
  onDrawnChange,
  savedObject,
  setMovePreview,
} from '@/render/scene-index.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { gizmoBusy, setGizmo } from './gizmo-state.ts';
import { moveDelta } from './snap.ts';
import { useSaveMove, type Move } from './use-save-move.ts';
import { useWorkPlaneLimit } from './use-work-plane-limit.ts';
import { toNdc, workPlanePoint } from './work-plane.ts';

/** The gizmo's size relative to its default, chosen to sit comfortably next to a body. */
export const GIZMO_SIZE = 0.8;

const ndc = new Vector2();

/**
 * Moving objects in edit mode (M3-T3, ux.md §5):
 * - **Drag on the plane:** pressing on an object (selecting it first if it isn't) and dragging
 *   moves the whole selection across the work plane at the grabbed object's height, keeping
 *   their offsets. Shift snaps the grabbed object to the grid.
 * - **Height:** a gizmo with only its vertical arrow, at the selection's center
 *   (drei `<TransformControls>`).
 *
 * During a drag only the move preview changes (scene-index.ts); releasing saves one batch.
 */
export function MoveTool({ mapId }: { mapId: string }) {
  // How far a drag may reach (work-plane.ts), current for the listeners below.
  const limit = useWorkPlaneLimit(mapId);
  const limitRef = useRef(limit);
  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);
  const editing = useEditor((state) => state.editing);
  const placing = useEditor((state) => state.placing);
  const selectedIds = useSelection((state) => state.selectedIds);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const queryClient = useQueryClient();
  const viewKey = queryKeys.view('galaxy', mapId, useReadOptions());
  const save = useSaveMove();

  // Writes need each object's version, from the payload the view shows.
  const movesFor = (ids: readonly string[], delta: readonly [number, number, number]): Move[] => {
    const objects = queryClient.getQueryData<GalaxyView>(viewKey)?.objects ?? [];
    return ids.flatMap((id) => {
      const object = objects.find((item) => item.id === id);
      const saved = savedObject(id);
      if (!object || !saved) return [];
      const [x, y, z] = saved.center;
      return [
        { id, version: object.version, position: [x + delta[0], y + delta[1], z + delta[2]] },
      ];
    });
  };
  const commit = () => {
    const preview = movePreview();
    if (!preview) return;
    const moves = movesFor([...preview.ids], preview.delta);
    if (moves.length === 0 || preview.delta.every((value) => value === 0)) {
      setMovePreview(null);
      return;
    }
    save.mutate(moves);
  };
  // The pointer and gizmo handlers outlive renders; they call the latest `commit` through this.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  // ---- dragging on the plane ------------------------------------------------------------
  useEffect(() => {
    if (!editing || placing) return;
    const canvas = get().gl.domElement;
    const platform = detectPlatform();
    let drag: {
      pointerId: number;
      start: { x: number; y: number };
      grabbedId: string;
      heightY: number;
      from: [number, number, number];
      ids: readonly string[] | null;
    } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch' || gizmoBusy()) return;
      const hit = pickAt(get(), event.clientX, event.clientY);
      if (!hit) return;
      const selected = useSelection.getState().selectedIds.includes(hit.id);
      const action = resolveBinding(
        'left-drag',
        event,
        'edit',
        selected ? 'selected' : 'object',
        platform,
      );
      if (action !== 'move') return;
      const heightY = hit.center[1];
      const from = workPlanePoint(
        get().camera,
        toNdc(event.clientX, event.clientY, canvas, ndc),
        heightY,
        limitRef.current,
      );
      if (!from) return;
      drag = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        grabbedId: hit.id,
        heightY,
        from,
        ids: null,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      if (!drag.ids) {
        if (isClick(drag.start, { x: event.clientX, y: event.clientY })) return;
        // The drag starts: an unselected object becomes the selection first.
        const selection = useSelection.getState();
        if (!selection.selectedIds.includes(drag.grabbedId)) selection.select([drag.grabbedId]);
        drag.ids = useSelection.getState().selectedIds;
      }
      // Past the limit, the preview stays where it last was.
      const to = workPlanePoint(
        get().camera,
        toNdc(event.clientX, event.clientY, canvas, ndc),
        drag.heightY,
        limitRef.current,
      );
      const grabbed = savedObject(drag.grabbedId);
      if (!to || !grabbed) return;
      const gridSize = event.shiftKey ? useEditor.getState().gridSize : null;
      setMovePreview({
        ids: new Set(drag.ids),
        delta: moveDelta(grabbed.center, drag.from, to, gridSize),
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      const current = drag;
      drag = null;
      if (current?.pointerId !== event.pointerId || !current.ids) return;
      commitRef.current();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [editing, placing, get]);

  // ---- the height gizmo -----------------------------------------------------------------
  const anchor = useRef<Group>(null);
  const gizmo = useRef<{ axis: string | null; dragging: boolean } | null>(null);
  const gizmoDrag = useRef<{ startY: number; ids: readonly string[] } | null>(null);
  const shiftHeld = useRef(false);
  const showGizmo = editing && !placing && selectedIds.length > 0;

  // Keep the anchor at the selection's center whenever the selection or the data changes.
  useEffect(() => {
    if (!showGizmo) return;
    const place = () => {
      const group = anchor.current;
      if (!group || gizmoDrag.current) return;
      const centers = selectedIds.flatMap((id) => {
        const object = drawnObject(id);
        return object ? [object.center] : [];
      });
      if (centers.length === 0) return;
      group.position.set(
        centers.reduce((sum, c) => sum + c[0], 0) / centers.length,
        centers.reduce((sum, c) => sum + c[1], 0) / centers.length,
        centers.reduce((sum, c) => sum + c[2], 0) / centers.length,
      );
      invalidate();
    };
    place();
    const keys = (event: KeyboardEvent) => {
      shiftHeld.current = event.shiftKey;
    };
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', keys);
    const stop = onDrawnChange(place);
    return () => {
      stop();
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', keys);
    };
  }, [showGizmo, selectedIds, invalidate]);

  useEffect(() => {
    if (!showGizmo) return;
    setGizmo(gizmo.current, anchor.current);
    return () => {
      setGizmo(null);
    };
  }, [showGizmo]);

  if (!showGizmo) return null;
  return (
    <>
      <group ref={anchor} />
      <TransformControls
        ref={gizmo as never}
        object={anchor as never}
        mode="translate"
        space="world"
        size={GIZMO_SIZE}
        showX={false}
        showZ={false}
        onMouseDown={() => {
          gizmoDrag.current = { startY: anchor.current?.position.y ?? 0, ids: selectedIds };
        }}
        onObjectChange={() => {
          const drag = gizmoDrag.current;
          const group = anchor.current;
          if (!drag || !group) return;
          const gridSize = shiftHeld.current ? useEditor.getState().gridSize : null;
          const [, dy] = moveDelta(
            [0, drag.startY, 0],
            [0, drag.startY, 0],
            [0, group.position.y, 0],
            gridSize,
          );
          // Only height: the gizmo shows just its vertical arrow, but keep x and z exact.
          setMovePreview({ ids: new Set(drag.ids), delta: [0, dy, 0] });
        }}
        onMouseUp={() => {
          gizmoDrag.current = null;
          commitRef.current();
        }}
      />
    </>
  );
}
