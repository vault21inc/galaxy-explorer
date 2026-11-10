/**
 * The outliner's keyboard (ux.md §10, M3-T9), as a pure function of the visible rows, the row
 * with focus and the key: where focus goes and how the selection changes. The tree follows
 * the ARIA tree pattern: arrows and Home/End move, Space selects, Shift extends the selection,
 * the primary modifier with Space toggles a row, and Escape clears. With groups (M4-T4), Right
 * opens a row or moves into it, Left closes it or moves to its parent, and Space or Enter on a
 * layer or group type row, which can't be selected, opens or closes it.
 */

export interface OutlinerKey {
  key: string;
  shift: boolean;
  /** Cmd on macOS, Ctrl elsewhere. */
  primary: boolean;
}

export interface OutlinerMove {
  /** The row to focus next. */
  focus: string | null;
  /** How the selection changes, by row; absent when it doesn't. */
  select?: { ids: string[]; add?: boolean; toggle?: boolean };
  /** A row to open or close. */
  expand?: { row: string; open: boolean };
}

/** What the keys need to know about the tree's shape; a flat list needs none of it. */
export interface OutlinerTree {
  parentOf: (row: string) => string | null;
  /** Open or closed for a row with children; null for a leaf. */
  openOf: (row: string) => boolean | null;
  /** Whether the row stands for something to select (layer and type rows don't). */
  selectable: (row: string) => boolean;
}

const FLAT: OutlinerTree = { parentOf: () => null, openOf: () => null, selectable: () => true };

/** The move for a key press, or null when the outliner doesn't handle the key. */
export function outlinerKey(
  rows: readonly string[],
  focused: string | null,
  { key, shift, primary }: OutlinerKey,
  tree: OutlinerTree = FLAT,
): OutlinerMove | null {
  if (rows.length === 0) return null;
  const index = focused === null ? -1 : rows.indexOf(focused);
  const at = (next: number) => rows[Math.max(0, Math.min(rows.length - 1, next))] ?? null;
  // Moving with Shift held adds the row moved to: extending the selection one row at a time.
  const moveTo = (target: string | null): OutlinerMove =>
    shift && target !== null && tree.selectable(target)
      ? { focus: target, select: { ids: [target], add: true } }
      : { focus: target };

  switch (key) {
    case 'ArrowDown':
      return moveTo(index === -1 ? at(0) : at(index + 1));
    case 'ArrowUp':
      return moveTo(index === -1 ? at(0) : at(index - 1));
    case 'ArrowRight': {
      if (focused === null) return null;
      const open = tree.openOf(focused);
      if (open === false) return { focus: focused, expand: { row: focused, open: true } };
      // Open: the first child is the next row.
      return open === true ? { focus: at(index + 1) } : null;
    }
    case 'ArrowLeft': {
      if (focused === null) return null;
      if (tree.openOf(focused) === true) {
        return { focus: focused, expand: { row: focused, open: false } };
      }
      const parent = tree.parentOf(focused);
      return parent === null ? null : { focus: parent };
    }
    case 'Home':
      return moveTo(at(0));
    case 'End':
      return moveTo(at(rows.length - 1));
    case ' ':
    case 'Enter': {
      // Entering a system (Enter) arrives with the system view in M5; until then it selects.
      const target = index === -1 ? at(0) : focused;
      if (target === null) return null;
      if (!tree.selectable(target)) {
        const open = tree.openOf(target);
        return open === null ? null : { focus: target, expand: { row: target, open: !open } };
      }
      if (primary && key === ' ') return { focus: target, select: { ids: [target], toggle: true } };
      if (shift) return { focus: target, select: { ids: [target], add: true } };
      return { focus: target, select: { ids: [target] } };
    }
    case 'Escape':
      return { focus: focused, select: { ids: [] } };
    default:
      return null;
  }
}
