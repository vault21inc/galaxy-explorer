import { unwrap } from '@ge/api-client';
import { useQuery } from '@tanstack/react-query';
import { api } from './client.ts';

/**
 * `GET /api/v1/attributions` (M8-T9): where the text and images of the universes this reader
 * can open came from, for the attributions page. It's refetched when the page opens, since
 * signing in changes which universes count.
 */
export function useAttributions() {
  return useQuery({
    queryKey: ['attributions'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/attributions', { signal })),
    staleTime: 0,
  });
}

/** One universe's credits, as the generated client types them. */
export type UniverseCredits = NonNullable<
  ReturnType<typeof useAttributions>['data']
>['universes'][number];
export type SourceCredit = UniverseCredits['sources'][number];
