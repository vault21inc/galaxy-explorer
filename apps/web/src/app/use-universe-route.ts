import { useMaps, useUniverses, type GalaxyMap, type Universe } from '@/api/containers.ts';

/**
 * Resolves the slugs in `/u/:universeSlug/:mapSlug` to records. Pages and the top bar call it
 * with the same slugs and share TanStack Query's cache, so it costs two requests per universe,
 * however many components ask.
 */
export type UniverseRoute =
  | { status: 'loading' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'missing'; what: 'universe' | 'map'; slug: string }
  | { status: 'ready'; universe: Universe; maps: GalaxyMap[]; map: GalaxyMap | undefined };

export function useUniverseRoute(universeSlug: string, mapSlug?: string): UniverseRoute {
  const universes = useUniverses();
  const universe = universes.data?.find((item) => item.slug === universeSlug);
  const maps = useMaps(universe?.id);

  if (universes.error) {
    return { status: 'error', error: universes.error, retry: () => void universes.refetch() };
  }
  if (!universes.data) return { status: 'loading' };
  if (!universe) return { status: 'missing', what: 'universe', slug: universeSlug };
  if (maps.error) return { status: 'error', error: maps.error, retry: () => void maps.refetch() };
  if (!maps.data) return { status: 'loading' };

  const map = mapSlug === undefined ? undefined : maps.data.find((item) => item.slug === mapSlug);
  if (mapSlug !== undefined && !map) return { status: 'missing', what: 'map', slug: mapSlug };
  return { status: 'ready', universe, maps: maps.data, map };
}
