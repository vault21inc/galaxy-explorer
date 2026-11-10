import { objectTypes, resolveAppearance } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector2, Vector3, type Object3D } from 'three';
import { isClick } from '@/input/click.ts';
import { clampedRadiusPx } from '@/render/bodies/body-scale.ts';
import { worldPerPxAt1 } from '@/render/screen-scale.ts';
import { renderers } from '@/render/registry.ts';
import { GALAXY_BODY_MAX_PX, GALAXY_BODY_MIN_PX } from '@/render/tuning.ts';
import { useEditor } from '@/state/editor.ts';
import { optimisticObject, useCreateObject } from './use-create-object.ts';

/** Renderers that can draw a ghost of their own look (D-28); others get a plain sphere. */
const GHOST_RENDERERS = new Set(['system-glyphs', 'black-holes', 'icon-sprites']);
import { toNdc, workPlanePoint } from './work-plane.ts';

/** Where the ghost is now, for the test hooks; null while it isn't shown. */
let ghostAt: { baseType: string; position: [number, number, number] } | null = null;
export function placementGhost() {
  return ghostAt;
}

const ndc = new Vector2();
const scratch = new Vector3();

/**
 * Placing a new object (M3-T2, ux.md §5): a see-through ghost of the chosen type follows the
 * pointer on the work plane (y = 0); a click creates the object there; Esc or a right-click
 * cancels. Lives inside the galaxy view while a type is being placed.
 */
export function Placement({ mapId }: { mapId: string }) {
  const placing = useEditor((state) => state.placing);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const create = useCreateObject(mapId);
  const ghost = useRef<Object3D>(null);

  useEffect(() => {
    if (!placing) return;
    const canvas = get().gl.domElement;
    let press: { x: number; y: number } | null = null;

    const pointAt = (event: PointerEvent) =>
      workPlanePoint(get().camera, toNdc(event.clientX, event.clientY, canvas, ndc));

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
      create.mutate({ baseType: placing, position: at });
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
  const renderer = placing ? renderers.galaxy?.[placing] : undefined;
  const glyph = renderer && GHOST_RENDERERS.has(renderer.name) ? renderer : undefined;
  const ghostObjects = useMemo(
    () => (placing ? [optimisticObject({ baseType: placing, position: [0, 0, 0] })] : []),
    [placing],
  );

  // A sphere ghost keeps the size a body of its type would have, clamped like InstancedBodies.
  useFrame(({ camera, size }) => {
    const mesh = ghost.current;
    if (!mesh?.visible || !placing || glyph) return;
    const radius = resolveAppearance({ baseType: placing, view: 'galaxy' }).size ?? 1_000;
    scratch.copy(mesh.position).applyMatrix4(camera.matrixWorldInverse);
    const perPx = worldPerPxAt1(camera, size.height);
    const depth = -scratch.z;
    const radiusPx = clampedRadiusPx(
      radius,
      depth,
      perPx,
      GALAXY_BODY_MIN_PX / 2,
      GALAXY_BODY_MAX_PX / 2,
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
