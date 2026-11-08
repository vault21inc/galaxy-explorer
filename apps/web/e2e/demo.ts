import type { APIRequestContext } from '@playwright/test';

interface Page<T> {
  data: T[];
}

/** The objects of a map's galaxy view, read from the API the app uses. */
export async function galaxyObjects(
  request: APIRequestContext,
  universeSlug: string,
  mapSlug: string,
) {
  const universes = (await (await request.get('/api/v1/universes')).json()) as Page<{
    id: string;
    slug: string;
  }>;
  const universe = universes.data.find((item) => item.slug === universeSlug);
  if (!universe) throw new Error(`No universe ${universeSlug}`);
  const maps = (await (await request.get(`/api/v1/universes/${universe.id}/maps`)).json()) as Page<{
    id: string;
    slug: string;
  }>;
  const map = maps.data.find((item) => item.slug === mapSlug);
  if (!map) throw new Error(`No map ${mapSlug}`);
  const view = (await (await request.get(`/api/v1/maps/${map.id}/views/galaxy`)).json()) as {
    data: {
      objects: { id: string; namePlain: string; baseType: string; isSpoiler: boolean }[];
    };
  };
  return view.data.objects;
}
