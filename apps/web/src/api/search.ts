import { unwrap, type components } from '@ge/api-client';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { api } from './client.ts';

/** Search (M7-T6): a universe's entries matching the command palette's words. */

export type SearchResult = components['schemas']['SearchResult'];

export function useSearch(
  universeId: string | undefined,
  q: string,
  options: { spoilers: 'include' | 'exclude'; includeDrafts: boolean },
) {
  const words = q.trim();
  return useQuery({
    queryKey: ['search', universeId ?? '', words, options.spoilers, options.includeDrafts],
    queryFn:
      universeId === undefined || words === ''
        ? skipToken
        : ({ signal }) =>
            unwrap(
              api.GET('/api/v1/universes/{universeId}/search', {
                params: {
                  path: { universeId },
                  query: {
                    q: words,
                    spoilers: options.spoilers,
                    limit: 12,
                    ...(options.includeDrafts ? { includeDrafts: 'true' as const } : {}),
                  },
                },
                signal,
              }),
            ),
    // While the next words load, the last results stay, so the list doesn't flash empty.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
