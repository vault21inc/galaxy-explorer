import { createStore } from 'zustand/vanilla';

/**
 * How much of the canvas the details panel covers, in CSS pixels from each edge
 * (docs/plan/later/phone-usability.md, "The view shift", D-58). On a phone held upright an
 * opened details sheet covers the bottom, and the top bar the top; on its side the side panel
 * covers the right. All zero when nothing is opened over the map, and in wider windows.
 */
export interface ViewInsets {
  topPx: number;
  rightPx: number;
  bottomPx: number;
}

export const NO_INSETS: ViewInsets = { topPx: 0, rightPx: 0, bottomPx: 0 };

/**
 * A plain store outside React, as the hover store is: the canvas's view-shift driver
 * subscribes to it directly (render/camera/view-shift-driver.tsx), so no component re-renders
 * when the panel changes height. The details panel sets it; nothing sets it per frame.
 */
export const viewInsetsStore = createStore<ViewInsets>()(() => NO_INSETS);

export function setViewInsets(next: ViewInsets): void {
  const now = viewInsetsStore.getState();
  if (now.topPx !== next.topPx || now.rightPx !== next.rightPx || now.bottomPx !== next.bottomPx) {
    viewInsetsStore.setState(next, true);
  }
}
