import { unwrap } from '@ge/api-client';
import { skipToken, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client.ts';

/**
 * The wiki reads behind "Fill from wiki" (M7-T3): the configured wikis, a search, and a page's
 * preview. The API keeps the wiki's answers for a day, so these stay fresh for the page's life.
 */

export function useWikiSources() {
  return useQuery({
    queryKey: ['wiki', 'sources'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/wiki/sources', { signal })),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useWikiSearch(source: string | undefined, query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['wiki', 'search', source, q],
    queryFn:
      source === undefined || q === ''
        ? skipToken
        : ({ signal }) =>
            unwrap(api.GET('/api/v1/wiki/search', { params: { query: { source, q } }, signal })),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useWikiPreview(source: string | undefined, title: string | null) {
  return useQuery({
    queryKey: ['wiki', 'preview', source, title],
    queryFn:
      source === undefined || title === null
        ? skipToken
        : ({ signal }) =>
            unwrap(
              api.GET('/api/v1/wiki/preview', { params: { query: { source, title } }, signal }),
            ),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
