import { create } from 'zustand';

/** The panels that take the left side in edit mode, one at a time (ux.md §1). */
export type LeftPanel = 'history' | 'map-settings';

interface SidePanelState {
  left: LeftPanel | null;
  /** View mode's List button: the outliner, which edit mode always shows. */
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
  /** Opens the panel, or closes it if it's the one open. */
  toggle: (panel: LeftPanel) => void;
  close: () => void;
}

/**
 * Which left-hand panel is open (ux.md §1). In edit mode the outliner (M3-T9) is there unless
 * History (M3-T6) or Map settings (M3-T8) takes its place; closing that brings the outliner
 * back. In view mode the outliner opens with the List button. They never stack.
 */
export const useSidePanel = create<SidePanelState>()((set, get) => ({
  left: null,
  listOpen: false,
  setListOpen: (listOpen) => {
    set({ listOpen });
  },
  toggle: (panel) => {
    set({ left: get().left === panel ? null : panel });
  },
  close: () => {
    set({ left: null });
  },
}));
