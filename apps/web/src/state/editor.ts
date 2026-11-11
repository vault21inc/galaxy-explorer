import type { BaseType, ViewLevel } from '@ge/domain';
import { create } from 'zustand';

interface EditorState {
  /** Edit mode (ux.md §2): plain left-drag edits, drafts and spoilers show. */
  editing: boolean;
  /**
   * Whether edit mode is on offer here: the reader may edit (`useCanEdit`) and the page has a
   * view to edit. Set by the edit toggle while it's mounted; the E key reads it.
   */
  available: boolean;
  /** Placing a new object: its base type, while the ghost follows the pointer (M3-T2). */
  placing: BaseType | null;
  /** The Route tool is on (M4-T7): clicks add waypoints instead of selecting. */
  routing: boolean;
  /** The Add menu is open (the toolbar button or N). */
  addMenuOpen: boolean;
  /** An object just created, whose name field should take focus once its panel shows. */
  focusNameOf: string | null;
  /**
   * Shift-dragging snaps positions to multiples of this, in each view's unit (ux.md §5): the
   * reader's own spacing per view; a view without one uses its default (levels/registry.ts).
   */
  gridSizes: Partial<Record<ViewLevel, number>>;
  setGridSize: (level: ViewLevel, size: number) => void;
  setEditing: (editing: boolean) => void;
  toggle: () => void;
  setAvailable: (available: boolean) => void;
  startPlacing: (baseType: BaseType) => void;
  cancelPlacing: () => void;
  startRouting: () => void;
  stopRouting: () => void;
  setAddMenuOpen: (open: boolean) => void;
  setFocusNameOf: (id: string | null) => void;
}

/** Leaving edit mode ends whatever the editor was in the middle of. */
const IDLE = { editing: false, placing: null, routing: false, addMenuOpen: false } as const;

/** Edit mode. It changes on a click or the E key, never per frame. */
export const useEditor = create<EditorState>()((set, get) => ({
  ...IDLE,
  available: false,
  focusNameOf: null,
  gridSizes: {},
  setGridSize: (level, size) => {
    if (Number.isFinite(size) && size > 0)
      set({ gridSizes: { ...get().gridSizes, [level]: size } });
  },
  setEditing: (editing) => {
    set(editing && get().available ? { editing: true } : IDLE);
  },
  toggle: () => {
    get().setEditing(!get().editing);
  },
  setAvailable: (available) => {
    // Leaving a page that offers editing also leaves edit mode.
    set(available ? { available } : { available, ...IDLE });
  },
  startPlacing: (baseType) => {
    if (get().editing) set({ placing: baseType, routing: false, addMenuOpen: false });
  },
  cancelPlacing: () => {
    set({ placing: null });
  },
  startRouting: () => {
    if (get().editing) set({ routing: true, placing: null, addMenuOpen: false });
  },
  stopRouting: () => {
    set({ routing: false });
  },
  setAddMenuOpen: (open) => {
    set({ addMenuOpen: open && get().editing });
  },
  setFocusNameOf: (id) => {
    set({ focusNameOf: id });
  },
}));

/**
 * Whether a tool owns the canvas's clicks: placing an object (M3-T2) or drawing a route
 * (M4-T7). Selection, box selection, the move tool and double-click step aside meanwhile.
 */
export function toolOwnsClicks(): boolean {
  const { placing, routing } = useEditor.getState();
  return placing !== null || routing;
}
