import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { resetViewCamera } from '@/render/camera/use-view-camera.ts';
import { KEY_PAN_FRACTION, KEY_ZOOM_FACTOR } from '@/render/tuning.ts';
import { KEY_BINDINGS, type KeyAction } from './bindings.ts';

/**
 * Keyboard camera keys (ux.md §4): arrows pan, `+`/`−` zoom, H or Home resets the view. Steps
 * scale with the camera's distance to its target, so a press feels the same zoomed in or out.
 * Keys are ignored while focus is in a text field or a widget that uses arrows itself.
 */
export function useCameraKeys(): void {
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
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // With Cmd/Ctrl/Alt held, + and − are the browser's page zoom and arrows edit text.
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (ignoresCameraKeys(event.target)) return;
      const action = KEY_BINDINGS[event.key];
      if (!action) return;
      event.preventDefault(); // arrows would scroll the page
      void perform(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [controlsReady, get]);
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
