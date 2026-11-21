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
import { equatorToView, viewToEquator } from '@/render/orbits/equator-frame.ts';
import { heightAbovePlane, toNdc, workPlanePoint } from './work-plane.ts';

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
 * In the orbit view the plane is the planet's equator, tilted with it (D-60): the drag, the
 * grid and the gizmo's arrow all follow the tilt, and positions are turned back into the
 * planet's own frame before they're saved (orbits/equator-frame.ts).
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
  const { tiltRad } = view;
  const tiltRef = useRef(tiltRad);
  useEffect(() => {
    limitRef.current = limit;
    levelRef.current = level;
    tiltRef.current = tiltRad;
  }, [limit, level, tiltRad]);
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
      // Drawn positions are in the view; saved ones in the planet's frame (D-60).
      const position = viewToEquator([x + delta[0], y + delta[1], z + delta[2]], tiltRad);
      return [{ id, version: object.version, position }];
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
  const currentRef = useRef(current);
  useEffect(() => {
    carriedRef.current = carried;
    currentRef.current = current;
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
      // A press on a route's line isn't a drag of anything, and an object drawn here that
      // belongs to another frame (a planet's moon in the system view) isn't moved here.
      if (!hit || hit.waypointIds) return;
      if (!currentRef.current().some((object) => object.id === hit.id)) return;
      const selected = useSelection.getState().selectedIds.includes(hit.id);
      const action = resolveBinding(
        'left-drag',
        event,
        'edit',
        selected ? 'selected' : 'object',
        platform,
      );
      if (action !== 'move') return;
      const heightY = heightAbovePlane(hit.center, tiltRef.current);
      const from = workPlanePoint(
        get().camera,
        toNdc(event.clientX, event.clientY, canvas, ndc),
        heightY,
        limitRef.current,
        tiltRef.current,
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
      const tilt = tiltRef.current;
      const to = workPlanePoint(
        get().camera,
        toNdc(event.clientX, event.clientY, canvas, ndc),
        drag.heightY,
        limitRef.current,
        tilt,
      );
      const grabbed = savedObject(drag.grabbedId);
      if (!to || !grabbed) return;
      const gridSize = event.shiftKey ? gridSizeIn(levelRef.current) : null;
      // Snapped in the plane's own frame, so the grid lines up with the (tilted) equator.
      const delta = moveDelta(
        viewToEquator(grabbed.center, tilt),
        viewToEquator(drag.from, tilt),
        viewToEquator(to, tilt),
        gridSize,
      );
      setMovePreview({ ids: new Set(drag.ids), delta: equatorToView(delta, tilt) });
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
  const gizmoDrag = useRef<{
    start: [number, number, number];
    ids: readonly string[];
  } | null>(null);
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
      {/* Turned like the planet in a tilted orbit view, so the arrow in its own frame points
          along the pole (D-60); in the other views the turn is 0 and it's the world's y. */}
      <group ref={anchor} rotation-x={tiltRad} />
      <TransformControls
        ref={gizmo as never}
        object={anchor as never}
        mode="translate"
        space="local"
        size={GIZMO_SIZE}
        showX={false}
        showZ={false}
        onMouseDown={() => {
          const at = anchor.current?.position;
          gizmoDrag.current = {
            start: at ? [at.x, at.y, at.z] : [0, 0, 0],
            ids: carriedRef.current(selectedIds),
          };
        }}
        onObjectChange={() => {
          const drag = gizmoDrag.current;
          const group = anchor.current;
          if (!drag || !group) return;
          const gridSize = shiftHeld.current ? gridSizeIn(level) : null;
          // Heights are along the plane's normal: y, or the orbit view's planet's pole (D-60).
          const startY = heightAbovePlane(drag.start, tiltRad);
          const nowY = heightAbovePlane(
            [group.position.x, group.position.y, group.position.z],
            tiltRad,
          );
          const [, dy] = moveDelta([0, startY, 0], [0, startY, 0], [0, nowY, 0], gridSize);
          // Only height: the gizmo shows just its vertical arrow, but keep the rest exact.
          setMovePreview({ ids: new Set(drag.ids), delta: equatorToView([0, dy, 0], tiltRad) });
        }}
        onMouseUp={() => {
          gizmoDrag.current = null;
          commitRef.current();
        }}
      />
    </>
  );
}
