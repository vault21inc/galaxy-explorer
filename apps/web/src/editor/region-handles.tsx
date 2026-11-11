import {
  defaultRiftPath,
  isRegionType,
  pointsAlong,
  type PlanePoint,
  type ViewObject,
} from '@ge/domain';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { Vector2 } from 'three';
import { resolvedRegion, riftCurve } from '@/render/regions/region-shape.ts';
import { CLICK_MAX_MOVE_PX } from '@/render/tuning.ts';
import { useRegionEdit } from '@/state/region-edit.ts';
import { useRegionPreview } from '@/state/region-preview.ts';
import { useSelection } from '@/state/selection.ts';
import { addRiftPoint, moveRiftPoint, removeRiftPoint } from './rift-points.ts';
import { useSaveRegion } from './use-save-region.ts';
import { useEditView } from '@/levels/use-edit-view.ts';
import { toNdc, workPlanePoint } from './work-plane.ts';

/** A path as the schema stores it: plain [x, z] pairs. */
const asPath = (points: readonly PlanePoint[]) =>
  points.map(([px, pz]): [number, number] => [px, pz]);

/** The smallest radius a drag can give, in light-years. */
const MIN_RADIUS_LY = 10;
const ndc = new Vector2();

const HANDLE_CLASS =
  'block size-3.5 cursor-grab rounded-full border-2 border-white bg-primary shadow outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing';

/**
 * Reshaping the selected region on the map in edit mode (M4-T6, ux.md §5):
 * - a **radius handle** on its edge (for a rift, beside its first point: the band's half-width);
 * - for a rift, a **handle per point**: drag to move, click to select, Delete to remove; and
 *   while "Add points" is on in its form, a click on the map adds a point at the nearer end.
 *
 * Handles are small DOM elements placed at points in 3D (drei's `<Html>`), so they take the
 * pointer and keyboard focus like any control. A drag previews the new shape
 * (`useRegionPreview`); releasing saves it as one batch.
 */
export function RegionHandles({ objects }: { objects: readonly ViewObject[] }) {
  const selectedIds = useSelection((state) => state.selectedIds);
  const preview = useRegionPreview((state) => state.preview);
  const [onlyId] = selectedIds;
  const saved =
    selectedIds.length === 1 ? objects.find((object) => object.id === onlyId) : undefined;
  if (!saved || !isRegionType(saved.baseType)) return null;
  const object =
    preview?.id === saved.id
      ? {
          ...saved,
          appearance: {
            ...saved.appearance,
            region: { ...saved.appearance.region, ...preview.region },
          },
        }
      : saved;
  return <Handles saved={saved} object={object} />;
}

function Handles({ saved, object }: { saved: ViewObject; object: ViewObject }) {
  const get = useThree((state) => state.get);
  // How far a handle may reach (work-plane.ts), as for every other drag in this view.
  const view = useEditView();
  const limit = view?.payload ? view.edit.workPlaneLimit(view.payload) : 0;
  const save = useSaveRegion();
  const selectedPoint = useRegionEdit((state) => state.selectedPoint);
  const adding = useRegionEdit((state) => state.addingPointsTo === object.id);
  const region = resolvedRegion(object);
  const [x, y, z] = object.position;
  const isRift = region.shape === 'rift';
  const path: PlanePoint[] = useMemo(
    () => [...(region.path ?? defaultRiftPath(region.radius))],
    [region.path, region.radius],
  );
  const name = object.namePlain;

  const pointIndex =
    selectedPoint?.[0] === object.id && region.shape === 'rift' ? selectedPoint[1] : null;

  // While a rift point is selected, Delete removes the point, not the rift (the editor's Delete
  // would remove the whole object). This listens on the window in the capture phase, so it runs
  // before the editor's own listener and stops it, wherever focus is, unless it's in a text
  // field. A point is deselected when the handles go (another selection, or leaving edit mode).
  useEffect(() => {
    if (pointIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = removeRiftPoint(path, pointIndex);
      if (!next) return;
      useRegionEdit.getState().selectPoint(null);
      void save(object.id, { path: asPath(next) }, `Remove a point of “${name}”`);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [pointIndex, path, save, object.id, name]);
  useEffect(
    () => () => {
      useRegionEdit.getState().selectPoint(null);
    },
    [],
  );

  // Where the pointer meets the region's plane, or null.
  const planeAt = (clientX: number, clientY: number) =>
    workPlanePoint(get().camera, toNdc(clientX, clientY, get().gl.domElement, ndc), y, limit);

  // The radius handle: on the edge, or for a rift beside its first point, across the band.
  const curve = isRift ? riftCurve(object, region) : null;
  const start = curve ? pointsAlong(curve, 2)[0] : undefined;
  const anchor: PlanePoint = start ? start.point : [x, z];
  const across: PlanePoint = start ? [-start.tangent[1], start.tangent[0]] : [1, 0];
  const radiusAt: [number, number, number] = [
    anchor[0] + across[0] * region.radius,
    y,
    anchor[1] + across[1] * region.radius,
  ];

  const radiusDrag = makeDrag({
    planeAt,
    apply: (point) => ({
      radius: Math.max(MIN_RADIUS_LY, Math.hypot(point[0] - anchor[0], point[2] - anchor[1])),
    }),
    onRelease: (region) => void save(object.id, region, `Edit radius of “${name}”`),
    id: object.id,
  });

  return (
    <>
      <Html position={radiusAt} center zIndexRange={[30, 20]}>
        <button
          type="button"
          data-keys="own"
          aria-label={isRift ? `Width of ${name}` : `Radius of ${name}`}
          title={isRift ? 'Drag to change the band’s width' : 'Drag to change the radius'}
          className={HANDLE_CLASS}
          {...radiusDrag}
        />
      </Html>
      {isRift &&
        path.map(([px, pz], index) => {
          const selected = selectedPoint?.[0] === object.id && selectedPoint[1] === index;
          const drag = makeDrag({
            planeAt,
            apply: (point) => ({
              path: asPath(moveRiftPoint(path, index, [point[0] - x, point[2] - z])),
            }),
            onRelease: (region) => void save(object.id, region, `Move a point of “${name}”`),
            onClick: (element) => {
              useRegionEdit.getState().selectPoint([object.id, index]);
              // Safari doesn't focus a clicked button; Delete then still reaches the point.
              element.focus();
            },
            id: object.id,
          });
          return (
            <Html key={index} position={[x + px, y, z + pz]} center zIndexRange={[30, 20]}>
              <button
                type="button"
                data-keys="own"
                aria-label={`Point ${(index + 1).toString()} of ${name}`}
                aria-pressed={selected}
                className={`${HANDLE_CLASS} ${selected ? 'bg-white' : 'bg-background'}`}
                {...drag}
              />
            </Html>
          );
        })}
      {adding && <AddPoints rift={saved} path={path} planeAt={planeAt} />}
    </>
  );
}

interface Press {
  x: number;
  y: number;
  moved: boolean;
}

/**
 * The press in progress on any handle. One pointer drags one handle at a time, and the press
 * must outlive the handles' re-renders: each preview update renders them again.
 */
let activePress: Press | null = null;

/**
 * Pointer handlers for a handle. A press that moves past the click threshold drags: each move
 * previews `apply(point)`, and the release saves it with `onRelease`. One that doesn't is a
 * click. The pointer is captured, so the drag keeps following it off the handle.
 */
function makeDrag({
  planeAt,
  apply,
  onRelease,
  onClick,
  id,
}: {
  planeAt: (clientX: number, clientY: number) => [number, number, number] | null;
  apply: (
    point: [number, number, number],
  ) => Parameters<ReturnType<typeof useRegionPreview.getState>['show']>[1];
  onRelease: (region: Parameters<ReturnType<typeof useRegionPreview.getState>['show']>[1]) => void;
  onClick?: (element: HTMLElement) => void;
  id: string;
}) {
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      activePress = { x: event.clientX, y: event.clientY, moved: false };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = activePress;
      if (!current) return;
      const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (!current.moved && distance <= CLICK_MAX_MOVE_PX) return;
      current.moved = true;
      const point = planeAt(event.clientX, event.clientY);
      if (point) useRegionPreview.getState().show(id, apply(point));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const released = activePress;
      activePress = null;
      if (!released) return;
      if (!released.moved) {
        onClick?.(event.currentTarget);
        return;
      }
      const shown = useRegionPreview.getState().preview;
      if (shown?.id === id) onRelease(shown.region);
    },
  };
}

/**
 * While a rift takes new points: a plain click on the map adds one at the nearer end of the
 * path and saves it. The click is the rift's, so it neither selects nor starts a box: these
 * listeners run first (capture phase) and stop the event. Esc, or selecting something else,
 * ends it.
 */
function AddPoints({
  rift,
  path,
  planeAt,
}: {
  rift: ViewObject;
  path: readonly PlanePoint[];
  planeAt: (clientX: number, clientY: number) => [number, number, number] | null;
}) {
  const get = useThree((state) => state.get);
  const save = useSaveRegion();
  const latest = useRef({ path, planeAt, save });
  useEffect(() => {
    latest.current = { path, planeAt, save };
  });

  useEffect(() => {
    const canvas = get().gl.domElement;
    let press: { x: number; y: number } | null = null;
    const plain = (event: globalThis.PointerEvent) =>
      event.button === 0 && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!plain(event)) return;
      event.stopImmediatePropagation();
      press = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: globalThis.PointerEvent) => {
      if (!press || !plain(event)) return;
      event.stopImmediatePropagation();
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      press = null;
      if (moved > CLICK_MAX_MOVE_PX) return;
      const { path: current, planeAt: at, save: write } = latest.current;
      const point = at(event.clientX, event.clientY);
      if (!point) return;
      const [x, , z] = rift.position;
      const next = addRiftPoint(current, [point[0] - x, point[2] - z]);
      if (next) void write(rift.id, { path: asPath(next) }, `Add a point to “${rift.namePlain}”`);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useRegionEdit.getState().stopAddingPoints();
    };
    canvas.addEventListener('pointerdown', onDown, { capture: true });
    canvas.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true });
      canvas.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('keydown', onKey);
      // Selecting something else, or leaving edit mode, ends adding points.
      useRegionEdit.getState().stopAddingPoints();
    };
  }, [get, rift.id, rift.position, rift.namePlain]);
  return null;
}
