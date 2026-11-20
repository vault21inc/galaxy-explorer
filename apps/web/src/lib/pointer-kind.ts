import { useSyncExternalStore } from 'react';
import { FINE_POINTER_QUERY, isSlimNow, matches } from './layout-tier.ts';

/**
 * Whether there's a mouse or trackpad to edit with (D-57, docs/plan/later/phone-usability.md,
 * "Who is offered editing"): editing in 3D needs one, at any size of screen.
 *
 * True when the browser reports a fine pointer (`(any-pointer: fine)`), or once a pointer event
 * from a mouse has been seen on the page: a mouse plugged into a phone or tablet, or a browser
 * whose media query is wrong. Seen once, it stays true for the page's life: a mouse put down
 * for a moment hasn't gone.
 */
let mouseSeen = false;
const listeners = new Set<() => void>();
let watching = false;

function onPointer(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return;
  mouseSeen = true;
  stopWatching();
  for (const listener of listeners) listener();
}

function stopWatching(): void {
  if (!watching) return;
  watching = false;
  window.removeEventListener('pointerdown', onPointer, true);
  window.removeEventListener('pointermove', onPointer, true);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(FINE_POINTER_QUERY)
      : null;
  media?.addEventListener('change', onChange);
  if (!mouseSeen && !watching && typeof window !== 'undefined') {
    // In the capture phase, so a control that stops the event doesn't hide the mouse from us.
    watching = true;
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
  }
  return () => {
    listeners.delete(onChange);
    media?.removeEventListener('change', onChange);
    if (listeners.size === 0) stopWatching();
  };
}

/** Whether there's a mouse or trackpad now, outside React (the test hooks). */
export function hasFinePointer(): boolean {
  return mouseSeen || matches(FINE_POINTER_QUERY);
}

/** Whether there's a mouse or trackpad, following one being plugged in or first used. */
export function useHasFinePointer(): boolean {
  return useSyncExternalStore(subscribe, hasFinePointer);
}

/**
 * Whether the reader works the app by its buttons, not its keys: on a phone (the slim tier),
 * or wherever there's no mouse or trackpad. Capture mode shows buttons for its keys then
 * (app/capture-controls.tsx), and what it says speaks of taps, not of keys to press.
 */
export function usesTouchControls(): boolean {
  return isSlimNow() || !hasFinePointer();
}
