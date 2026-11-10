import { create } from 'zustand';

interface GroupDialogState {
  open: boolean;
  show: () => void;
  close: () => void;
}

/**
 * The "Group the selection" dialog (M4-T2): ⌘/Ctrl + G, the toolbar's Group button and the
 * context menu open it; the editor actions draw it.
 */
export const useGroupDialog = create<GroupDialogState>()((set) => ({
  open: false,
  show: () => {
    set({ open: true });
  },
  close: () => {
    set({ open: false });
  },
}));
