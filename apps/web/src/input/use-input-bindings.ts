import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { pickAt } from '@/render/picking/picking.ts';
import { GESTURE_LOG_SCALE_TO_PX } from '@/render/tuning.ts';
import { useSelection } from '@/state/selection.ts';
import { resolveBinding, type Gesture, type HeldKeys, type Mode } from './bindings.ts';
import { buttonAction, touchActions, wheelAction } from './camera-actions.ts';
import { detectPlatform } from './platform.ts';
import { gestureDeltaPx, wheelDeltaPx } from './wheel.ts';

const NO_KEYS: HeldKeys = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

/** The mouse buttons, as `PointerEvent.button` numbers them. */
const BUTTON_GESTURES: Record<number, Gesture> = {
  0: 'left-drag',
  1: 'middle-drag',
  2: 'right-drag',
};

/** Our own re-dispatched wheel events, which the interceptor lets through. */
const normalized = new WeakSet<Event>();

/**
 * Connects the bindings table to camera-controls (rendering.md §12). camera-controls knows
 * nothing about modifier keys or modes; it only has a fixed action per mouse button. So:
 *
 * - **Per press:** just before camera-controls sees a pointer press, look up what this press
 *   does (with the keys held right now) and set that button's action. Holding Option turns the
 *   left button into ROTATE for that drag; Cmd turns it into TRUCK (pan).
 * - **Wheel:** every wheel event is converted to pixels (wheel.ts) and re-sent without ctrlKey.
 *   camera-controls would otherwise treat a trackpad pinch (ctrl+wheel) as a field-of-view zoom
 *   instead of moving the camera.
 * - **Safari pinch:** `gesturechange` events become the same wheel events, at the pinch point.
 * - **Right-click:** the browser's menu is suppressed on the canvas.
 *
 * Listeners sit on `window` in the capture phase, so they run before camera-controls' own.
 */
export function useInputBindings(mode: Mode): void {
  const get = useThree((state) => state.get);
  // Subscribed so this runs once `<CameraControls makeDefault>` has registered itself.
  const controlsReady = useThree((state) => state.controls !== null);

  useEffect(() => {
    // The controls are a three.js-side object this hook configures, so it's read from the
    // store here rather than held as React state.
    const { controls, gl } = get();
    if (!(controls instanceof CameraControlsImpl)) return;
    // R3F listens on the canvas's wrapper, and drei connects the controls there too.
    const element = gl.domElement.parentElement ?? gl.domElement;
    const platform = detectPlatform();
    const onCanvas = (event: Event) =>
      event.target instanceof Node && element.contains(event.target);

    // Touch never has modifiers, and touch editing is out of scope (ux.md §3): view mode.
    controls.touches = touchActions(
      resolveBinding('touch-drag', NO_KEYS, 'view', 'empty', platform),
      resolveBinding('touch-two-finger-drag', NO_KEYS, 'view', 'empty', platform),
      resolveBinding('pinch', NO_KEYS, 'view', 'empty', platform),
    );
    controls.mouseButtons.wheel = wheelAction(
      resolveBinding('wheel', NO_KEYS, mode, 'empty', platform),
    );

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !onCanvas(event)) return;
      const gesture = BUTTON_GESTURES[event.button];
      if (!gesture) return;
      // What the press starts on decides some edit-mode drags (move versus box-select).
      const hit = pickAt(get(), event.clientX, event.clientY);
      const target =
        hit === null
          ? 'empty'
          : useSelection.getState().selectedIds.includes(hit.id)
            ? 'selected'
            : 'object';
      const action = buttonAction(resolveBinding(gesture, event, mode, target, platform));
      if (event.button === 0) controls.mouseButtons.left = action;
      else if (event.button === 1) controls.mouseButtons.middle = action;
      else controls.mouseButtons.right = action;
    };

    const zoomAt = (deltaPx: number, target: EventTarget, clientX: number, clientY: number) => {
      const wheel = new WheelEvent('wheel', {
        deltaY: deltaPx,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      });
      normalized.add(wheel);
      target.dispatchEvent(wheel);
    };

    let gestureActive = false;
    const onWheel = (event: WheelEvent) => {
      if (normalized.has(event) || !onCanvas(event) || !event.target) return;
      // Stop the page from scrolling or zooming, and camera-controls from seeing the raw event.
      event.preventDefault();
      event.stopImmediatePropagation();
      // Safari reports a pinch both ways in some versions; its gesture events win.
      if (gestureActive && event.ctrlKey) return;
      zoomAt(wheelDeltaPx(event, element.clientHeight), event.target, event.clientX, event.clientY);
    };

    // Safari's GestureEvent isn't in TypeScript's DOM types; these are the fields used.
    type GestureLike = Event & { scale: number; clientX: number; clientY: number };
    let lastScale = 1;
    const onGestureStart = (event: Event) => {
      if (!onCanvas(event)) return;
      event.preventDefault();
      gestureActive = true;
      lastScale = 1;
    };
    const onGestureChange = (event: Event) => {
      if (!gestureActive || !event.target) return;
      event.preventDefault();
      const gesture = event as GestureLike;
      zoomAt(
        gestureDeltaPx(gesture.scale, lastScale, GESTURE_LOG_SCALE_TO_PX),
        event.target,
        gesture.clientX,
        gesture.clientY,
      );
      lastScale = gesture.scale;
    };
    const onGestureEnd = (event: Event) => {
      if (!gestureActive) return;
      event.preventDefault();
      gestureActive = false;
    };

    const onContextMenu = (event: Event) => {
      if (onCanvas(event)) event.preventDefault();
    };

    const capture = { capture: true } as const;
    const activeCapture = { capture: true, passive: false } as const;
    window.addEventListener('pointerdown', onPointerDown, capture);
    window.addEventListener('wheel', onWheel, activeCapture);
    window.addEventListener('gesturestart', onGestureStart, activeCapture);
    window.addEventListener('gesturechange', onGestureChange, activeCapture);
    window.addEventListener('gestureend', onGestureEnd, activeCapture);
    window.addEventListener('contextmenu', onContextMenu, capture);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, capture);
      window.removeEventListener('wheel', onWheel, activeCapture);
      window.removeEventListener('gesturestart', onGestureStart, activeCapture);
      window.removeEventListener('gesturechange', onGestureChange, activeCapture);
      window.removeEventListener('gestureend', onGestureEnd, activeCapture);
      window.removeEventListener('contextmenu', onContextMenu, capture);
    };
  }, [controlsReady, get, mode]);
}
