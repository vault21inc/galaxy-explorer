/** A settings row as ordering sees it. */
export interface Ordered {
  id: string;
  sortKey: number;
}

/**
 * The sort keys to save when a row moves from `from` to `to` (indexes in the list before and
 * after the move), as `{ id, sortKey }` updates (M4-T1).
 *
 * Usually that's one update: the moved row takes the midpoint of its new neighbours' keys, or
 * one less than the first, or one more than the last. Keys are numeric in the database, so
 * there is room between any two different ones. Only when both neighbours share a key, which
 * rows created with an explicit key can do, are the rows renumbered 0, 1, 2… in the new order,
 * and then only those whose key changes.
 */
export function reorderUpdates(items: readonly Ordered[], from: number, to: number): Ordered[] {
  const moved = items[from];
  if (!moved || from === to || to < 0 || to >= items.length) return [];
  const rest = items.filter((_, index) => index !== from);
  const before = rest[to - 1];
  const after = rest[to];
  if (!before && after) return [{ id: moved.id, sortKey: after.sortKey - 1 }];
  if (before && !after) return [{ id: moved.id, sortKey: before.sortKey + 1 }];
  if (before && after && before.sortKey < after.sortKey) {
    return [{ id: moved.id, sortKey: (before.sortKey + after.sortKey) / 2 }];
  }
  const order = [...rest.slice(0, to), moved, ...rest.slice(to)];
  return order
    .map((item, index) => ({ id: item.id, sortKey: index, was: item.sortKey }))
    .filter((item) => item.sortKey !== item.was)
    .map(({ id, sortKey }) => ({ id, sortKey }));
}

/** Where a dragged row lands: the index whose row's middle is the first below the pointer. */
export function dropIndex(
  rowMiddlesPx: readonly number[],
  pointerYPx: number,
  from: number,
): number {
  let index = rowMiddlesPx.findIndex((middle) => pointerYPx < middle);
  if (index === -1) index = rowMiddlesPx.length;
  // Indexes after the dragged row shift up by one once it's taken out.
  return index > from ? index - 1 : index;
}
