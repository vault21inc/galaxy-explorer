import { create } from 'zustand';

interface PaletteState {
  /** The command palette is open (M7-T6). */
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** The command palette: opened by ⌘/Ctrl + K or the top bar's Search button. */
export const usePalette = create<PaletteState>()((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
