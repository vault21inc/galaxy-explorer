import { unwrap } from '@ge/api-client';
import { useQuery } from '@tanstack/react-query';
import { api } from './client.ts';

/** `GET /api/health`: whether the API is up, and how it authenticates (architecture.md §7). */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/health', { signal })),
    staleTime: Infinity,
  });
}
