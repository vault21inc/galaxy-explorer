import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { flyTo } from '@/render/camera/fly-to.ts';
import { pickAt } from '@/render/picking/picking.ts';
import { hoverStore, setHovered } from '@/state/hover.ts';
import { gizmoBusy } from '@/editor/gizmo-state.ts';
import { useContextMenu } from '@/state/context-menu.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { resolveBinding, type Gesture, type Mode, type Target } from './bindings.ts';
import { isClick } from './click.ts';
import { detectPlatform } from './platform.ts';

/**
 * Hover and selection in the canvas (ux.md §3, §5; rendering.md §10):
 * - pointer moves with no button held pick the object under the pointer: the hover store and
 *   the pointer cursor follow it;
 * - a press released within 4 px is a click: select, toggle or clear, as the bindings say;
 * - in edit mode a right-click (or a Mac Ctrl-click) on an object opens the context menu,
 *   selecting the object first unless it's already part of the selection;
 * - a double-click flies to the object (entering it arrives in M5).
 */
export function usePointerSelection(mode: Mode): void {
  const get = useThree((state) => state.get);

  useEffect(() => {
    const element = get().gl.domElement;
    const platform = detectPlatform();
    let press: { x: number; y: number; button: number; pointerId: number } | null = null;

    const targetOf = (id: string | null): Target =>
      id === null
        ? 'empty'
        : useSelection.getState().selectedIds.includes(id)
          ? 'selected'
          : 'object';

    const onPointerMove = (event: PointerEvent) => {
      // While dragging the camera moves; hovering waits until the button is released.
      if (event.buttons !== 0 || event.pointerType === 'touch') return;
      setHovered(pickAt(get(), event.clientX, event.clientY)?.id ?? null);
    };
    const onPointerLeave = () => {
      setHovered(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      // A press on the height gizmo is the gizmo's, not a click on what lies behind it.
      if (gizmoBusy()) {
        press = null;
        return;
      }
      press = {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        pointerId: event.pointerId,
      };
    };
    const onPointerUp = (event: PointerEvent) => {
      const started = press;
      press = null;
      // While an object is being placed, clicks belong to the placement.
      if (useEditor.getState().placing) return;
      if (started?.pointerId !== event.pointerId || started.button !== event.button) return;
      if (!isClick(started, { x: event.clientX, y: event.clientY })) return;
      const gesture: Gesture | null =
        event.pointerType === 'touch'
          ? 'tap'
          : event.button === 0
            ? 'left-click'
            : event.button === 2
              ? 'right-click'
              : null;
      if (!gesture) return;
      const hit = pickAt(get(), event.clientX, event.clientY);
      const action = resolveBinding(gesture, event, mode, targetOf(hit?.id ?? null), platform);
      const selection = useSelection.getState();
      if (action === 'select') {
        if (hit) selection.select([hit.id]);
        else selection.clear();
      } else if (action === 'toggle-select' && hit) {
        selection.select([hit.id], { toggle: true });
      } else if (action === 'context-menu' && hit) {
        if (!selection.selectedIds.includes(hit.id)) selection.select([hit.id]);
        useContextMenu.getState().open(event.clientX, event.clientY);
      }
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (useEditor.getState().placing) return;
      const hit = pickAt(get(), event.clientX, event.clientY);
      if (!hit) return;
      const action = resolveBinding('double-click', event, mode, targetOf(hit.id), platform);
      const { controls } = get();
      if (action === 'enter' && controls instanceof CameraControlsImpl) void flyTo(controls, [hit]);
    };

    // The pointer cursor follows the hover store, without React.
    const unsubscribe = hoverStore.subscribe((state) => {
      element.style.cursor = state.hoveredId === null ? '' : 'pointer';
    });

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('dblclick', onDoubleClick);
    return () => {
      unsubscribe();
      element.style.cursor = '';
      setHovered(null);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('dblclick', onDoubleClick);
    };
  }, [get, mode]);
}
