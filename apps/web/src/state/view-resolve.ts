import {
  objectTypes,
  type BaseType,
  type GalaxyView,
  type SystemView,
  type ViewLevel,
  type ViewPayload,
} from '@ge/domain';
import type { QueryClient } from '@tanstack/react-query';
import { fetchData } from '@/api/fetch-data.ts';
import type { EntityRead } from '@/api/hooks.ts';
import { queryKeys } from '@/api/keys.ts';
import { entityRequest, viewRequest, type ReadOptions } from '@/api/requests.ts';
import type { ViewTarget } from './navigation-stack.ts';

/**
 * What a view URL (ux.md §9) asks for:
 * - `view`: open this chain of views, from the galaxy down to the object's own view;
 * - `select`: the object doesn't open a view (a station, or a system not marked explorable), so
 *   open the view it sits in, its parent's, with it selected;
 * - `elsewhere`: the object is on another map, whose address should be used instead.
 * A missing object is an `ApiError` with status 404, as the API reports it.
 */
export type ViewResolution =
  | { kind: 'view'; chain: ViewTarget[] }
  | { kind: 'select'; parentId: string | null; objectId: string }
  | { kind: 'elsewhere'; mapId: string };

/** What resolving needs to know about an object. */
interface ObjectFacts {
  mapId: string;
  baseType: BaseType;
  explorable: boolean;
  parentId: string | null;
}

/**
 * Resolves `/u/…/{map}` (objectId null) or `/u/…/{map}/view/{objectId}` into the views to open.
 *
 * The object's level comes from its base type (`explorableAs`, architecture.md §3.3), and its
 * parent views from its ancestors, which its own view payload lists. Entering from a view, the
 * object is already in that view's cached payload, so the only request is for the payload the
 * new view draws anyway; a link opened cold first reads the object itself.
 */
export async function resolveView(
  client: QueryClient,
  mapId: string,
  objectId: string | null,
  options: ReadOptions,
): Promise<ViewResolution> {
  const galaxy: ViewTarget = { level: 'galaxy', subjectId: mapId };
  if (objectId === null) return { kind: 'view', chain: [galaxy] };

  const facts = cachedFacts(client, objectId) ?? (await fetchFacts(client, objectId, options));
  if (facts.mapId !== mapId) return { kind: 'elsewhere', mapId: facts.mapId };
  const level = objectTypes[facts.baseType].explorableAs;
  if (!level || !facts.explorable) {
    return { kind: 'select', parentId: facts.parentId, objectId };
  }
  const view = await client.query({
    queryKey: queryKeys.view(level, objectId, options),
    queryFn: ({ signal }) =>
      fetchData<ViewPayload<ViewLevel>>(viewRequest(level, objectId, options), signal),
    staleTime: Infinity,
  });
  const ancestors = 'ancestors' in view ? view.ancestors : [];
  const between = ancestors.flatMap((ancestor): ViewTarget[] => {
    const opens = objectTypes[ancestor.baseType].explorableAs;
    return opens ? [{ level: opens, subjectId: ancestor.id }] : [];
  });
  return { kind: 'view', chain: [galaxy, ...between, { level, subjectId: objectId }] };
}

/** The object as some cached view payload already describes it, without a request. */
function cachedFacts(client: QueryClient, objectId: string): ObjectFacts | undefined {
  for (const [, data] of client.getQueriesData<GalaxyView | SystemView>({ queryKey: ['view'] })) {
    if (!data) continue;
    if ('objects' in data) {
      const found = data.objects.find((object) => object.id === objectId);
      if (found) return { mapId: data.map.id, ...pick(found), parentId: null };
      continue;
    }
    if (data.subject.id === objectId) {
      return { mapId: data.map.id, ...pick(data.subject), parentId: data.subject.parentId };
    }
    const child = data.children.find((object) => object.id === objectId);
    if (child) return { mapId: data.map.id, ...pick(child), parentId: data.subject.id };
  }
  return undefined;
}

function pick(object: { baseType: BaseType; explorable: boolean }) {
  return { baseType: object.baseType, explorable: object.explorable };
}

async function fetchFacts(
  client: QueryClient,
  objectId: string,
  options: ReadOptions,
): Promise<ObjectFacts> {
  const object = await client.query({
    queryKey: queryKeys.entity('celestial_object', objectId, options),
    queryFn: ({ signal }) =>
      fetchData<EntityRead<'celestial_object'>>(
        entityRequest('celestial_object', objectId, options),
        signal,
      ),
  });
  return {
    mapId: object.mapId,
    baseType: object.baseType,
    explorable: object.explorable,
    parentId: object.parentId,
  };
}
