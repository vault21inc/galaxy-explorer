import { create } from 'zustand';

/** The panels that take the left side in edit mode, one at a time (ux.md §1). */
export type LeftPanel = 'history' | 'map-settings';

interface SidePanelState {
  left: LeftPanel | null;
  /** Opens the panel, or closes it if it's the one open. */
  toggle: (panel: LeftPanel) => void;
  close: () => void;
}

/**
 * Which left-hand panel is open: History (M3-T6) or Map settings (M3-T8). The outliner joins
 * them in M3-T9. Opening one closes the other, so they never stack.
 */
export const useSidePanel = create<SidePanelState>()((set, get) => ({
  left: null,
  toggle: (panel) => {
    set({ left: get().left === panel ? null : panel });
  },
  close: () => {
    set({ left: null });
  },
}));
