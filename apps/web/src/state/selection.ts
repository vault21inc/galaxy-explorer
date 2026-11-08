import { create } from 'zustand';

interface SelectionState {
  /** In selection order. */
  selectedIds: readonly string[];
  /**
   * Every way of selecting goes through here (ux.md §5): the canvas, the outliner, search.
   * `toggle` adds ids that aren't selected and removes those that are; `add` only adds;
   * neither replaces the selection.
   */
  select: (ids: readonly string[], options?: { add?: boolean; toggle?: boolean }) => void;
  clear: () => void;
}

/**
 * The selection. It changes on clicks, not per frame, so components may re-render on it. The
 * map page keeps it in sync with `?select=` (selection-url.ts).
 */
export const useSelection = create<SelectionState>()((set, get) => ({
  selectedIds: [],
  select: (ids, options = {}) => {
    const current = get().selectedIds;
    let next: string[];
    if (options.toggle) {
      const toggled = new Set(ids);
      next = current.filter((id) => !toggled.has(id));
      for (const id of ids) if (!current.includes(id)) next.push(id);
    } else if (options.add) {
      next = [...current, ...ids.filter((id) => !current.includes(id))];
    } else {
      next = [...new Set(ids)];
    }
    if (!sameIds(next, current)) set({ selectedIds: next });
  },
  clear: () => {
    if (get().selectedIds.length > 0) set({ selectedIds: [] });
  },
}));

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
