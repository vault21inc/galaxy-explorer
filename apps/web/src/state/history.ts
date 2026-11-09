import { create } from 'zustand';

interface HistoryState {
  /** The universe whose map is open: edits are recorded only there. */
  scope: string | null;
  /** The universe the stacks belong to. */
  stacksFor: string | null;
  /** Batch ids this session can undo, oldest first (M3-T6). */
  undo: readonly string[];
  /** Batch ids of undos, which redo reverts again; the latest last. */
  redo: readonly string[];
  /** Bumped on every recorded change, so the History panel can refetch. */
  changes: number;
  /** The History panel is open. */
  panelOpen: boolean;
  setScope: (universeId: string | null) => void;
  /** A new edit: it can be undone, and what was undone can no longer be redone. */
  record: (batchId: string) => void;
  /** Moves a batch between the stacks after an undo or redo (internal to use-undo.ts). */
  set: (stacks: { undo: readonly string[]; redo: readonly string[] }) => void;
  setPanelOpen: (open: boolean) => void;
}

/**
 * The undo and redo stacks (ux.md §5, data-model §9). Every write's response carries its batch
 * id (`X-GE-Batch-Id`); the API client records it here. Undo reverts the top batch and keeps
 * the revert's id for redo, which reverts that revert. Opening another universe starts afresh:
 * undoing there shouldn't reach back into this one.
 */
export const useHistory = create<HistoryState>()((set, get) => ({
  scope: null,
  stacksFor: null,
  undo: [],
  redo: [],
  changes: 0,
  panelOpen: false,
  setScope: (universeId) => {
    // Leaving for a page without a universe keeps the stacks for coming back.
    if (universeId === null || universeId === get().stacksFor) {
      set({ scope: universeId });
      return;
    }
    set({ scope: universeId, stacksFor: universeId, undo: [], redo: [] });
  },
  record: (batchId) => {
    if (get().scope === null) return;
    set({ undo: [...get().undo, batchId], redo: [], changes: get().changes + 1 });
  },
  set: ({ undo, redo }) => {
    set({ undo, redo, changes: get().changes + 1 });
  },
  setPanelOpen: (panelOpen) => {
    set({ panelOpen });
  },
}));
