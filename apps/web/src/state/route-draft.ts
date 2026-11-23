import { create } from 'zustand';
import { addWaypoint } from '@/editor/actions/route.ts';

interface RouteDraftState {
  /** The Route tool's waypoints so far, in click order (M4-T7). */
  waypoints: readonly string[];
  /**
   * Creates the route from the waypoints so far, if there are two at least. The Route tool sets
   * it while it's on (it lives in the canvas, where the map's objects are), so the toolbar's
   * Finish button and the Enter key do the same thing; null while the tool is off.
   */
  finish: (() => void) | null;
  add: (id: string) => void;
  removeLast: () => void;
  clear: () => void;
}

/** The route being drawn with the Route tool. It changes on clicks and keys, never per frame. */
export const useRouteDraft = create<RouteDraftState>()((set, get) => ({
  waypoints: [],
  finish: null,
  add: (id) => {
    set({ waypoints: addWaypoint(get().waypoints, id) });
  },
  removeLast: () => {
    set({ waypoints: get().waypoints.slice(0, -1) });
  },
  clear: () => {
    if (get().waypoints.length > 0) set({ waypoints: [] });
  },
}));
