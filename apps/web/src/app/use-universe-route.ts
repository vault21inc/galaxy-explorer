import { useMaps, useUniverseBySlug, type GalaxyMap, type Universe } from '@/api/containers.ts';

/**
 * Resolves the slugs in `/u/:universeSlug/:mapSlug` to records. Pages and the top bar call it
 * with the same slugs and share TanStack Query's cache, so it costs two requests per universe,
 * however many components ask. The universe is looked up by its address (M8-T11), so a
 * link-only universe, which no list shows, opens too.
 */
export type UniverseRoute =
  | { status: 'loading' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'missing'; what: 'universe' | 'map'; slug: string }
  | { status: 'ready'; universe: Universe; maps: GalaxyMap[]; map: GalaxyMap | undefined };

export function useUniverseRoute(universeSlug: string, mapSlug?: string): UniverseRoute {
  const found = useUniverseBySlug(universeSlug);
  const universe = found.data ?? undefined;
  const maps = useMaps(universe?.id);

  if (found.error) {
    return { status: 'error', error: found.error, retry: () => void found.refetch() };
  }
  if (found.data === undefined) return { status: 'loading' };
  if (!universe) return { status: 'missing', what: 'universe', slug: universeSlug };
  if (maps.error) return { status: 'error', error: maps.error, retry: () => void maps.refetch() };
  if (!maps.data) return { status: 'loading' };

  const map = mapSlug === undefined ? undefined : maps.data.find((item) => item.slug === mapSlug);
  if (mapSlug !== undefined && !map) return { status: 'missing', what: 'map', slug: mapSlug };
  return { status: 'ready', universe, maps: maps.data, map };
}
