import { ApiError, unwrap, type components } from '@ge/api-client';
import { rt } from '@ge/domain';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api } from './client.ts';
import { queryKeys } from './keys.ts';

/**
 * Universes and maps: the two containers (data-model §3.1). They aren't entity kinds, so they
 * have their own small hooks; their paths are literal, so the generated client types them.
 */

export type Universe = components['schemas']['UniverseRead'];
export type GalaxyMap = components['schemas']['MapRead'];

/** The API's largest page. There are only ever a handful of universes and maps. */
const ALL = 1_000;

export function useUniverses() {
  return useQuery({
    queryKey: queryKeys.universes(),
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/api/v1/universes', { params: { query: { limit: ALL } }, signal }),
      );
      return page.data;
    },
  });
}

/** A 404 as null: no universe there, or none this reader may see, which the API answers alike. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * The universe at `/u/{slug}` (M8-T11), for anyone who can read it, listed or not: null when
 * there's none, or none this reader may see.
 *
 * A share link is `/u/{slug}?k={key}` (M8-T12). With a key in the address, the universe is
 * unlocked first: the API remembers the key in a cookie, which every later request (and image)
 * carries. A key that no longer works isn't an error: the reader may still see the universe
 * another way (it's public, or shared with them), so it's looked up as usual.
 */
export function useUniverseBySlug(slug: string | undefined) {
  const [searchParams] = useSearchParams();
  const key = searchParams.get('k');
  return useQuery({
    queryKey: ['universe', 'by-slug', slug ?? '', key ?? ''],
    queryFn:
      slug === undefined
        ? skipToken
        : async ({ signal }) => {
            if (key) {
              const unlocked = await orNull(
                unwrap(api.POST('/api/v1/universes/unlock', { body: { slug, key }, signal })),
              );
              if (unlocked) return unlocked;
            }
            return orNull(
              unwrap(
                api.GET('/api/v1/universes/by-slug/{slug}', { params: { path: { slug } }, signal }),
              ),
            );
          },
  });
}

/** A universe's maps in switcher order: by `sortKey` (for example by era), then by name. */
export function useMaps(universeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.maps(universeId ?? ''),
    queryFn:
      universeId === undefined
        ? skipToken
        : async ({ signal }) => {
            const page = await unwrap(
              api.GET('/api/v1/universes/{universeId}/maps', {
                params: { path: { universeId }, query: { limit: ALL } },
                signal,
              }),
            );
            return page.data.toSorted(byMapOrder);
          },
  });
}

function byMapOrder(a: GalaxyMap, b: GalaxyMap): number {
  return a.sortKey - b.sortKey || a.namePlain.localeCompare(b.namePlain);
}

/** The map `/u/:universeSlug` opens: the universe's default map if it has one, else the first. */
export function defaultMapOf(
  universe: Universe,
  maps: readonly GalaxyMap[],
): GalaxyMap | undefined {
  const preferred = universe.settings.defaultMapId;
  return maps.find((map) => map.id === preferred) ?? maps[0];
}

export interface NewUniverse {
  name: string;
  slug: string;
}

/** The first map of a new universe, so it opens straight into the galaxy view. */
const FIRST_MAP = { slug: 'main', name: 'Main' } as const;

/**
 * Creates a universe and its first map. Two requests, so two batches in its history; if the
 * second fails, the universe page offers the empty state instead.
 */
export function useCreateUniverse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, slug }: NewUniverse) => {
      const universe = await unwrap(
        api.POST('/api/v1/universes', { body: { slug, name: rt.plain(name) } }),
      );
      const map = await unwrap(
        api.POST('/api/v1/universes/{universeId}/maps', {
          params: { path: { universeId: universe.id } },
          body: { slug: FIRST_MAP.slug, name: rt.plain(FIRST_MAP.name) },
        }),
      );
      return { universe, map };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['universe'] }),
  });
}
