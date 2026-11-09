/**
 * The outliner's keyboard (ux.md §10, M3-T9), as a pure function of the visible rows, the row
 * with focus and the key: where focus goes and how the selection changes. The tree follows
 * the ARIA tree pattern: arrows and Home/End move, Space selects, Shift extends the selection,
 * the primary modifier with Space toggles a row, and Escape clears.
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
  /** How the selection changes; absent when it doesn't. */
  select?: { ids: string[]; add?: boolean; toggle?: boolean };
}

/** The move for a key press, or null when the outliner doesn't handle the key. */
export function outlinerKey(
  rows: readonly string[],
  focused: string | null,
  { key, shift, primary }: OutlinerKey,
): OutlinerMove | null {
  if (rows.length === 0) return null;
  const index = focused === null ? -1 : rows.indexOf(focused);
  const at = (next: number) => rows[Math.max(0, Math.min(rows.length - 1, next))] ?? null;
  // Moving with Shift held adds the row moved to: extending the selection one row at a time.
  const moveTo = (target: string | null): OutlinerMove =>
    shift && target !== null
      ? { focus: target, select: { ids: [target], add: true } }
      : { focus: target };

  switch (key) {
    case 'ArrowDown':
      return moveTo(index === -1 ? at(0) : at(index + 1));
    case 'ArrowUp':
      return moveTo(index === -1 ? at(0) : at(index - 1));
    case 'Home':
      return moveTo(at(0));
    case 'End':
      return moveTo(at(rows.length - 1));
    case ' ':
    case 'Enter': {
      // Entering a system (Enter) arrives with the system view in M5; until then it selects.
      const target = index === -1 ? at(0) : focused;
      if (target === null) return null;
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
