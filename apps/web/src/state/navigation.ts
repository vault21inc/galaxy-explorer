import type { ViewLevel } from '@ge/domain';
import { create } from 'zustand';

/** A view the canvas can show: its level and subject (the map, or the object entered). */
export interface ViewEntry {
  level: ViewLevel;
  subjectId: string;
}

interface NavigationState {
  /** The view the canvas shows, or null on pages without one (the universe list). */
  current: ViewEntry | null;
  show: (entry: ViewEntry | null) => void;
}

/**
 * What the canvas shows (rendering.md §4). Routes set it; `<ViewHost>` in the canvas reads it.
 * M5 turns it into a stack with saved camera poses for entering and leaving views.
 */
export const useNavigation = create<NavigationState>()((set) => ({
  current: null,
  show: (entry) => {
    set({ current: entry });
  },
}));
