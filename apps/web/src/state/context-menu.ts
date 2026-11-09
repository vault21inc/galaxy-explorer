import { create } from 'zustand';

interface ContextMenuState {
  /** Where the menu opened, in page pixels, or null when it's closed. */
  at: { x: number; y: number } | null;
  open: (x: number, y: number) => void;
  close: () => void;
}

/**
 * The canvas context menu (ux.md §3, M3-T5). The canvas opens it on a right-click (or a Mac
 * Ctrl-click) on an object in edit mode, after selecting the object; the editor actions draw it.
 */
export const useContextMenu = create<ContextMenuState>()((set) => ({
  at: null,
  open: (x, y) => {
    set({ at: { x, y } });
  },
  close: () => {
    set({ at: null });
  },
}));
