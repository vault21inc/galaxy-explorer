import { create } from 'zustand';

interface HelpState {
  /** The shortcut help is open (M4-T9). */
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** The shortcut help panel: opened by `?` or the top bar's Help button. */
export const useHelp = create<HelpState>()((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
