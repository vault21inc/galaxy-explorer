import { create } from 'zustand';
import { addWaypoint } from '@/editor/actions/route.ts';

interface RouteDraftState {
  /** The Route tool's waypoints so far, in click order (M4-T7). */
  waypoints: readonly string[];
  add: (id: string) => void;
  removeLast: () => void;
  clear: () => void;
}

/** The route being drawn with the Route tool. It changes on clicks and keys, never per frame. */
export const useRouteDraft = create<RouteDraftState>()((set, get) => ({
  waypoints: [],
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
