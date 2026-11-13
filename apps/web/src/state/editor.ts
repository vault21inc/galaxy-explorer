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
  /** And its subtype, when one was chosen (Add ▸ Planet ▸ Hive World, M7-T2). */
  placingSubtypeId: string | null;
  /**
   * Placing a new place or event (M6-T5): a click on the globe (orbit view) or the plane
   * (galaxy and system views) puts it there.
   */
  placingLocated: LocatedKind | null;
  /**
   * Picking a new spot for an existing place or event (the panel's location editor, M6-T5):
   * the next click on the globe or plane becomes its location.
   */
  pickingLocation: { entityId: string; name: string; isSpoiler: boolean } | null;
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
  startPlacing: (baseType: BaseType, subtypeId?: string | null) => void;
  startPlacingLocated: (kind: LocatedKind) => void;
  startPickingLocation: (target: NonNullable<EditorState['pickingLocation']>) => void;
  cancelPlacing: () => void;
  startRouting: () => void;
  stopRouting: () => void;
  setAddMenuOpen: (open: boolean) => void;
  setFocusNameOf: (id: string | null) => void;
}

/** Leaving edit mode ends whatever the editor was in the middle of. */
const IDLE = {
  editing: false,
  placing: null,
  placingSubtypeId: null,
  placingLocated: null,
  pickingLocation: null,
  routing: false,
  addMenuOpen: false,
} as const;

/** The kinds placed by location rather than position (M6-T5). */
export type LocatedKind = 'place' | 'event';

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
  startPlacing: (baseType, subtypeId = null) => {
    if (get().editing) {
      set({
        placing: baseType,
        placingSubtypeId: subtypeId,
        placingLocated: null,
        pickingLocation: null,
        routing: false,
        addMenuOpen: false,
      });
    }
  },
  startPlacingLocated: (kind) => {
    if (get().editing) {
      set({
        placingLocated: kind,
        pickingLocation: null,
        placing: null,
        placingSubtypeId: null,
        routing: false,
        addMenuOpen: false,
      });
    }
  },
  startPickingLocation: (target) => {
    if (get().editing) {
      set({
        pickingLocation: target,
        placingLocated: null,
        placing: null,
        placingSubtypeId: null,
        routing: false,
        addMenuOpen: false,
      });
    }
  },
  cancelPlacing: () => {
    set({ placing: null, placingSubtypeId: null, placingLocated: null, pickingLocation: null });
  },
  startRouting: () => {
    if (get().editing) {
      set({
        routing: true,
        placing: null,
        placingSubtypeId: null,
        placingLocated: null,
        pickingLocation: null,
        addMenuOpen: false,
      });
    }
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
  const { placing, placingLocated, pickingLocation, routing } = useEditor.getState();
  return placing !== null || placingLocated !== null || pickingLocation !== null || routing;
}
