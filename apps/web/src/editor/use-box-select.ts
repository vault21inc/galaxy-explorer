import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { resolveBinding, type Mode } from '@/input/bindings.ts';
import { isClick } from '@/input/click.ts';
import { detectPlatform } from '@/input/platform.ts';
import { pickAt, projected } from '@/render/picking/picking.ts';
import { gizmoBusy } from '@/editor/gizmo-state.ts';
import { toolOwnsClicks } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { boxSelection, rectBetween } from './box.ts';

/**
 * Box selection (ux.md §3, §5; rendering.md §10): in edit mode a left-drag that starts on empty
 * space draws a rectangle, and releasing selects every object whose projected center is inside
 * it; Shift adds to the selection. The bindings table decides when a drag is a box; the camera
 * controls ignore that drag (its action is NONE).
 *
 * The rectangle is a plain DOM element moved with styles, not React state: it changes on every
 * pointer move (rendering.md §2, rule 3).
 */
export function useBoxSelect(mode: Mode): void {
  const get = useThree((state) => state.get);

  useEffect(() => {
    if (mode !== 'edit') return;
    const canvas = get().gl.domElement;
    const host = canvas.parentElement ?? canvas;
    const platform = detectPlatform();
    const box = document.createElement('div');
    box.dataset.testid = 'selection-box';
    box.style.cssText =
      'position:absolute;display:none;pointer-events:none;border:1px solid var(--primary);' +
      'background:color-mix(in srgb, var(--primary) 12%, transparent);';
    host.appendChild(box);

    let drag: { start: { x: number; y: number }; add: boolean; pointerId: number } | null = null;
    // Pointer positions relative to the canvas, as the picker measures them.
    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      if (toolOwnsClicks() || gizmoBusy()) return;
      const hit = pickAt(get(), event.clientX, event.clientY);
      const target = hit === null ? 'empty' : 'object';
      const action = resolveBinding('left-drag', event, mode, target, platform);
      if (action !== 'box-select' && action !== 'box-select-add') return;
      drag = { start: local(event), add: action === 'box-select-add', pointerId: event.pointerId };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      const at = local(event);
      if (isClick(drag.start, at)) return;
      const rect = rectBetween(drag.start, at);
      Object.assign(box.style, {
        display: 'block',
        left: `${rect.left.toString()}px`,
        top: `${rect.top.toString()}px`,
        width: `${(rect.right - rect.left).toString()}px`,
        height: `${(rect.bottom - rect.top).toString()}px`,
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      const current = drag;
      drag = null;
      box.style.display = 'none';
      if (current?.pointerId !== event.pointerId) return;
      const end = local(event);
      if (isClick(current.start, end)) return; // a click: the selection hook handles it
      const boxed = projected(get())
        .pickRect(rectBetween(current.start, end))
        .map((object) => object.id);
      const selection = useSelection.getState();
      selection.select(boxSelection(selection.selectedIds, boxed, current.add));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    // On the window, so the box follows a drag that leaves the canvas.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      box.remove();
    };
  }, [get, mode]);
}
