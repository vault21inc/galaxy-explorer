import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { sameIds, useSelection } from './selection.ts';

/** `?select=a,b` ↔ ['a', 'b'] (ux.md §9). */
export function parseSelectParam(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/**
 * Keeps the selection and `?select=` in step, both ways (ux.md §9): a shared link restores
 * the selection, and selecting updates the address without adding history entries (Back moves
 * between maps and views, not between clicks). A new map's URL has no `select`, so switching
 * maps clears the selection.
 */
export function useSelectionUrlSync(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('select');
  const { pathname } = useLocation();

  // URL → store, whenever the address changes (load, Back, Forward, a link, another view).
  // Another view's address counts even with the same `select`: a click's address update can
  // still be pending when a double-click enters a view, and the new view starts from its URL.
  useEffect(() => {
    const ids = parseSelectParam(fromUrl);
    if (!sameIds(ids, useSelection.getState().selectedIds)) useSelection.getState().select(ids);
  }, [fromUrl, pathname]);

  // Store → URL, whenever the selection changes.
  useEffect(
    () =>
      useSelection.subscribe((state) => {
        setSearchParams(
          (previous) => {
            const current = parseSelectParam(previous.get('select'));
            if (sameIds(current, state.selectedIds)) return previous;
            const next = new URLSearchParams(previous);
            if (state.selectedIds.length === 0) next.delete('select');
            else next.set('select', state.selectedIds.join(','));
            return next;
          },
          { replace: true },
        );
      }),
    [setSearchParams],
  );

  // Leaving the map page clears the selection.
  useEffect(
    () => () => {
      useSelection.getState().clear();
    },
    [],
  );
}
