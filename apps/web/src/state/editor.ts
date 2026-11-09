import { create } from 'zustand';

interface EditorState {
  /** Edit mode (ux.md §2): plain left-drag edits, drafts and spoilers show. */
  editing: boolean;
  /**
   * Whether edit mode is on offer here: the reader may edit (`useCanEdit`) and the page has a
   * view to edit. Set by the edit toggle while it's mounted; the E key reads it.
   */
  available: boolean;
  setEditing: (editing: boolean) => void;
  toggle: () => void;
  setAvailable: (available: boolean) => void;
}

/** Edit mode. It changes on a click or the E key, never per frame. */
export const useEditor = create<EditorState>()((set, get) => ({
  editing: false,
  available: false,
  setEditing: (editing) => {
    set({ editing: editing && get().available });
  },
  toggle: () => {
    const { editing, available } = get();
    set({ editing: !editing && available });
  },
  setAvailable: (available) => {
    // Leaving a page that offers editing also leaves edit mode.
    set(available ? { available } : { available, editing: false });
  },
}));
