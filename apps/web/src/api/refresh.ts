import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Refreshes what a write changed: every query under these key prefixes (keys.ts).
 *
 * Reads still in flight are cancelled first. They may have started before the write committed
 * and so carry the old data, and TanStack Query reuses an in-flight fetch instead of starting a
 * new one when the query has no data yet (`invalidateQueries` only cancels fetches of queries
 * that already have data). Leaving edit mode right after a save hits exactly that: the reading
 * panel's first fetch races the PATCH. Then the queries are invalidated, which refetches the
 * ones on screen.
 */
export async function refreshAfterWrite(
  queryClient: QueryClient,
  prefixes: readonly QueryKey[],
): Promise<void> {
  await Promise.all(prefixes.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  await Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
