import { objectTypes, resolveAppearance } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector2, Vector3, type Object3D } from 'three';
import { isClick } from '@/input/click.ts';
import { clampedRadiusPx } from '@/render/bodies/body-scale.ts';
import { worldPerPxAt1 } from '@/render/screen-scale.ts';
import { renderers } from '@/render/registry.ts';
import type { EditView } from '@/levels/use-edit-view.ts';
import { useConfigList } from '@/api/hooks.ts';
import { useEditor } from '@/state/editor.ts';
import { optimisticObject, useCreateObject } from './use-create-object.ts';
import { toNdc, workPlanePoint } from './work-plane.ts';
import { viewToEquator } from '@/render/orbits/equator-frame.ts';

/** Renderers that can draw a ghost of their own look (D-28); others get a plain sphere. */
const GHOST_RENDERERS = new Set(['system-glyphs', 'black-holes', 'icon-sprites']);

/** Where the ghost is now, for the test hooks; null while it isn't shown. */
let ghostAt: { baseType: string; position: [number, number, number] } | null = null;
export function placementGhost() {
  return ghostAt;
}

const ndc = new Vector2();
const scratch = new Vector3();

/**
 * Placing a new object (M3-T2, ux.md §5): a see-through ghost of the chosen type follows the
 * pointer on the work plane (y = 0, or the tilted equator of the orbit view's planet, D-60); a
 * click creates the object there; Esc or a right-click
 * cancels. Lives inside the view being edited (galaxy or system) while a type is being placed;
 * the new object goes where the levels registry says (in the system, or at the top level).
 */
export function Placement({ view }: { view: EditView }) {
  const placing = useEditor((state) => state.placing);
  const placingSubtypeId = useEditor((state) => state.placingSubtypeId);
  // The chosen subtype (M7-T2): its defaults shape the ghost and the new object.
  const universeId = view.payload?.map.universeId;
  const subtypes = useConfigList('object_subtypes', universeId).data;
  const subtype = subtypes?.find((item) => item.id === placingSubtypeId) ?? null;
  const subtypeRef = useRef(subtype);
  useEffect(() => {
    subtypeRef.current = subtype;
  }, [subtype]);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const create = useCreateObject(view);
  const ghost = useRef<Object3D>(null);
  const { level, edit } = view;
  // How far a placement may reach (work-plane.ts); past it the ghost hides.
  const limit = view.payload ? edit.workPlaneLimit(view.payload) : 0;
  const limitRef = useRef(limit);
  // The orbit view's plane tilts with the planet's equator (D-60).
  const tiltRef = useRef(view.tiltRad);
  useEffect(() => {
    limitRef.current = limit;
    tiltRef.current = view.tiltRad;
  }, [limit, view.tiltRad]);

  useEffect(() => {
    if (!placing) return;
    const canvas = get().gl.domElement;
    let press: { x: number; y: number } | null = null;

    const pointAt = (event: PointerEvent) =>
      workPlanePoint(
        get().camera,
        toNdc(event.clientX, event.clientY, canvas, ndc),
        0,
        limitRef.current,
        tiltRef.current,
      );

    const onPointerMove = (event: PointerEvent) => {
      const object = ghost.current;
      const at = pointAt(event);
      if (!object) return;
      object.visible = at !== null;
      if (at) object.position.set(...at);
      ghostAt = at ? { baseType: placing, position: at } : null;
      invalidate();
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
      const at = pointAt(event);
      if (!at) return;
      useEditor.getState().cancelPlacing();
      // Saved in the planet's own frame in a tilted orbit view: on its equator, y = 0.
      create.mutate({
        baseType: placing,
        subtype: subtypeRef.current,
        position: viewToEquator(at, tiltRef.current),
      });
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.style.cursor = 'crosshair';
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.style.cursor = '';
      ghostAt = null;
      invalidate();
    };
    // `create.mutate` is stable; listing `create` would rebind on every mutation state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing, get, invalidate]);

  // A type with its own look (D-28) is drawn by its renderer, at the origin of the ghost's
  // group, which follows the pointer; that renderer clamps its own size.
  const renderer = placing ? renderers[level]?.[placing] : undefined;
  const glyph = renderer && GHOST_RENDERERS.has(renderer.name) ? renderer : undefined;
  const ghostObjects = useMemo(
    () =>
      placing ? [optimisticObject({ baseType: placing, subtype, position: [0, 0, 0] }, level)] : [],
    [placing, subtype, level],
  );

  // A sphere ghost keeps the size a body of its type would have, clamped like InstancedBodies.
  useFrame(({ camera, size }) => {
    const mesh = ghost.current;
    if (!mesh?.visible || !placing || glyph) return;
    const radius =
      resolveAppearance({
        baseType: placing,
        subtypeDefaults: subtypeRef.current?.defaultAppearance ?? null,
        view: level,
      }).size ?? 1;
    scratch.copy(mesh.position).applyMatrix4(camera.matrixWorldInverse);
    const perPx = worldPerPxAt1(camera, size.height);
    const depth = -scratch.z;
    const radiusPx = clampedRadiusPx(
      radius,
      depth,
      perPx,
      edit.ghostClampPx.min,
      edit.ghostClampPx.max,
    );
    mesh.scale.setScalar(radiusPx * perPx * Math.max(depth, 1e-3));
  });

  if (!placing) return null;
  if (glyph) {
    return (
      <group ref={ghost} visible={false}>
        <glyph.component objects={ghostObjects} ghost />
      </group>
    );
  }
  const color = objectTypes[placing].defaultAppearance.color;
  return (
    <mesh ref={ghost} visible={false} renderOrder={11} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.5}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}
