import { TransformControls } from '@react-three/drei';
import type { ViewLevel, ViewPayload } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { Vector2, type Group } from 'three';
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
import { objectsIn } from '@/levels/registry.ts';
import { gridSizeIn, type EditView } from '@/levels/use-edit-view.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { gizmoBusy, setGizmo } from './gizmo-state.ts';
import { moveDescription, withOrbiters } from './orbiters.ts';
import { moveDelta } from './snap.ts';
import { useSaveMove, type Move } from './use-save-move.ts';
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
 * A star carries the objects that orbit it (D-29), in the same preview and the same batch.
 *
 * During a drag only the move preview changes (scene-index.ts); releasing saves one batch.
 * It works in any view the levels registry lets the editor into (M5-T4).
 */
export function MoveTool({ view }: { view: EditView }) {
  const { level, viewKey } = view;
  // How far a drag may reach (work-plane.ts), current for the listeners below.
  const limit = view.payload ? view.edit.workPlaneLimit(view.payload) : 0;
  const limitRef = useRef(limit);
  const levelRef = useRef(level);
  useEffect(() => {
    limitRef.current = limit;
    levelRef.current = level;
  }, [limit, level]);
  const editing = useEditor((state) => state.editing);
  // Placing an object or drawing a route (M4-T7) owns the canvas: no drags, no gizmo.
  const placing = useEditor((state) => state.placing !== null || state.routing);
  const selection = useSelection((state) => state.selectedIds);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const queryClient = useQueryClient();
  // Only objects move: a selected group or route (M4-T7) has no position of its own.
  const { objects } = view;
  const selectedIds = useMemo(() => {
    const objectIds = new Set<string>(objects.map((object) => object.id));
    return selection.filter((id) => objectIds.has(id));
  }, [selection, objects]);
  const save = useSaveMove();

  /** The objects in the payload the view shows now (writes need their versions). */
  const current = () => {
    const payload = queryClient.getQueryData<ViewPayload<ViewLevel>>(viewKey);
    return payload ? objectsIn(payload) : [];
  };
  /** What a move of these objects carries: their orbiting objects too (D-29). */
  const carried = (ids: readonly string[]) => withOrbiters(ids, current());

  // Writes need each object's version, from the payload the view shows.
  const movesFor = (ids: readonly string[], delta: readonly [number, number, number]): Move[] => {
    const objects = current();
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
    const selected = useSelection.getState().selectedIds.filter((id) => preview.ids.has(id));
    save.mutate({
      moves,
      description: moveDescription(selected, [...preview.ids], current()),
    });
  };
  // The listeners below read these through refs, current at call time.
  const carriedRef = useRef(carried);
  useEffect(() => {
    carriedRef.current = carried;
  });
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
      // A press on a route's line isn't a drag of anything.
      if (!hit || hit.waypointIds) return;
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
        drag.ids = carriedRef.current(useSelection.getState().selectedIds);
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
      const gridSize = event.shiftKey ? gridSizeIn(levelRef.current) : null;
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
          gizmoDrag.current = {
            startY: anchor.current?.position.y ?? 0,
            ids: carriedRef.current(selectedIds),
          };
        }}
        onObjectChange={() => {
          const drag = gizmoDrag.current;
          const group = anchor.current;
          if (!drag || !group) return;
          const gridSize = shiftHeld.current ? gridSizeIn(level) : null;
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
