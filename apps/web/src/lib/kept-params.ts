/**
 * Query parameters that follow the reader from view to view, and to another map or page of the
 * same universe:
 * - `perf`, the development HUD (M0-T6);
 * - `k`, a share link's key (M8-T12), so that what's in the address bar can still be passed on
 *   as the link. Reading doesn't depend on it: opening the link once set a cookie;
 * - `capture`, capture mode's frame (D-55), so a clip can fly into a system and stay framed.
 *   The rest of a shot (`to`, `secs`, `spin`) belongs to the view it was set in, as `cam` does.
 *
 * The selection (`select`) belongs to the map it was made on, and isn't kept.
 */
export const KEPT_PARAMS = ['perf', 'k', 'capture'] as const;

/**
 * The kept parameters of `search` (a location's `?…`), plus `extra`, as a query string with its
 * `?`, or '' when there are none. `names` narrows what's kept: going to another universe keeps
 * only `perf`, since a share link's key belongs to its own universe.
 */
export function keptSearch(
  search: string,
  extra: Record<string, string> = {},
  names: readonly string[] = KEPT_PARAMS,
): string {
  const from = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const name of names) {
    const value = from.get(name);
    if (value !== null) params.set(name, value);
  }
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
