import { create } from 'zustand';
import { PUSH_RESET_MS } from '../tuning.ts';

/** The progress ring while the reader pushes past an enter or exit distance (rendering.md §4). */
export interface PushRing {
  /** Center on the page, in CSS pixels. */
  x: number;
  y: number;
  radiusPx: number;
  /** 0 to 1: how much of the push has been made. */
  progress: number;
}

export const usePushRing = create<{ ring: PushRing | null }>()(() => ({ ring: null }));

let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows the ring at this progress; it hides itself when the push lapses (PUSH_RESET_MS). */
export function showPushRing(ring: PushRing): void {
  usePushRing.setState({ ring });
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hidePushRing, PUSH_RESET_MS);
}

export function hidePushRing(): void {
  clearTimeout(hideTimer);
  if (usePushRing.getState().ring) usePushRing.setState({ ring: null });
}
