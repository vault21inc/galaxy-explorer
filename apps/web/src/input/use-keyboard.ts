import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { flyTo } from '@/render/camera/fly-to.ts';
import { resetViewCamera } from '@/render/camera/use-view-camera.ts';
import { drawnObject, type DrawnObject } from '@/render/scene-index.ts';
import { useEditor } from '@/state/editor.ts';
import { useLabels } from '@/state/labels.ts';
import { useSpoilers } from '@/state/spoilers.ts';
import { useSelection } from '@/state/selection.ts';
import { KEY_PAN_FRACTION, KEY_ZOOM_FACTOR } from '@/render/tuning.ts';
import { KEY_BINDINGS, type KeyAction } from './bindings.ts';

/**
 * Keyboard shortcuts (ux.md §4): arrows pan, `+`/`−` zoom, H or Home resets the view, F frames
 * the selection and Esc clears it. Camera steps scale with the camera's distance to its target,
 * so a press feels the same zoomed in or out. Keys are ignored while focus is in a text field
 * or a widget that uses arrows itself.
 */
export function useKeyboard(): void {
  const get = useThree((state) => state.get);
  const controlsReady = useThree((state) => state.controls !== null);

  useEffect(() => {
    const { controls } = get();
    if (!(controls instanceof CameraControlsImpl)) return;
    const camera = controls;

    const perform = (action: KeyAction) => {
      const panBy = camera.distance * KEY_PAN_FRACTION;
      // camera-controls' truck(x, y) moves the camera across the screen: +x right, +y down.
      switch (action) {
        case 'pan-left':
          return camera.truck(-panBy, 0, true);
        case 'pan-right':
          return camera.truck(panBy, 0, true);
        case 'pan-up':
          return camera.truck(0, -panBy, true);
        case 'pan-down':
          return camera.truck(0, panBy, true);
        case 'zoom-in':
          // dolly() moves toward the target by that many units: here 1 − 1/1.25 of the distance.
          return camera.dolly(camera.distance * (1 - 1 / KEY_ZOOM_FACTOR), true);
        case 'zoom-out':
          return camera.dolly(-camera.distance * (KEY_ZOOM_FACTOR - 1), true);
        case 'reset-view':
          resetViewCamera(camera);
          return;
        case 'frame-selection': {
          const selected = useSelection
            .getState()
            .selectedIds.map((id) => drawnObject(id))
            .filter((object): object is DrawnObject => object !== undefined);
          return flyTo(camera, selected);
        }
        case 'clear-selection':
          useSelection.getState().clear();
          return;
        case 'cycle-labels':
          useLabels.getState().cycle();
          return;
        case 'toggle-edit':
          useEditor.getState().toggle();
          return;
        case 'toggle-spoilers':
          useSpoilers.getState().toggle();
          return;
        case 'show-all-labels':
          // Released in onKeyUp; holding the key repeats keydown, which changes nothing.
          useLabels.getState().setShowAllHeld(true);
          return;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // With Cmd/Ctrl/Alt held, + and − are the browser's page zoom and arrows edit text.
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (ignoresCameraKeys(event.target)) return;
      const action = KEY_BINDINGS[event.key];
      if (!action) return;
      // Space and Enter press a focused button or link; leave them to it.
      if (event.key === ' ' && isPressable(event.target)) return;
      // "S" alone (Caps Lock) isn't the shortcut: it needs Shift.
      if (action === 'toggle-spoilers' && !event.shiftKey) return;
      event.preventDefault(); // arrows would scroll the page
      void perform(action);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (KEY_BINDINGS[event.key] === 'show-all-labels') useLabels.getState().setShowAllHeld(false);
    };
    // Switching windows while holding Space never delivers the key-up.
    const onBlur = () => {
      useLabels.getState().setShowAllHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [controlsReady, get]);
}

/** Buttons and links, which Space activates. */
function isPressable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a[href], [role="button"]') !== null;
}

/** Text fields and widgets with their own arrow keys (menus, trees, radio groups, sliders). */
export function ignoresCameraKeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
    return true;
  }
  return (
    target.closest(
      '[role="menu"], [role="listbox"], [role="tree"], [role="dialog"], [role="slider"], [role="radiogroup"]',
    ) !== null
  );
}
