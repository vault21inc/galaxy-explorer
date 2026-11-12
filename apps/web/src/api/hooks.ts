import type {
  ConfigReadOf,
  ConfigResource,
  EntityInclude,
  EntityKind,
  EntityReadOf,
  EventList,
  ViewLevel,
  ViewPayload,
} from '@ge/domain';
import { skipToken, useQuery } from '@tanstack/react-query';
import { fetchData } from './fetch-data.ts';
import { queryKeys } from './keys.ts';
import {
  configListRequest,
  entityListRequest,
  entityRequest,
  eventListRequest,
  viewRequest,
  type EntityOptions,
  type EntityScope,
  type ListFilters,
  type ReadOptions,
} from './requests.ts';

/**
 * The query hooks, generic over the registries (architecture.md §3): one hook per access
 * pattern, never one per kind. `useEntity('celestial_object', id)` and
 * `useEntity('character', id)` are the same code, typed by the kind's read schema.
 */

/** An entity as the API returns it, plus the aspects asked for with `include`. */
export type EntityRead<K extends EntityKind> = EntityReadOf<K> &
  Partial<Record<EntityInclude, unknown>>;

export interface EntityPage<K extends EntityKind> {
  data: EntityRead<K>[];
  nextCursor: string | null;
}

/** One entity. Pass `undefined` as the id to wait (nothing is fetched until there is one). */
export function useEntity<K extends EntityKind>(
  kind: K,
  id: string | undefined,
  options: EntityOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.entity(kind, id ?? '', options),
    queryFn:
      id === undefined
        ? skipToken
        : ({ signal }) => fetchData<EntityRead<K>>(entityRequest(kind, id, options), signal),
  });
}

/** One page of a kind within a map, or a universe for universe-scoped kinds. */
export function useEntityList<K extends EntityKind>(
  kind: K,
  scope: EntityScope<K> | undefined,
  filters: ListFilters = {},
) {
  return useQuery({
    queryKey: queryKeys.entityList(kind, scope ?? {}, filters),
    queryFn:
      scope === undefined
        ? skipToken
        : ({ signal }) => fetchData<EntityPage<K>>(entityListRequest(kind, scope, filters), signal),
  });
}

/**
 * A view's render payload (architecture.md §6): the map's id for the galaxy view, the object's
 * for the system and orbit views. Payloads change only when the owner edits, so they stay fresh
 * until a write invalidates `['view']`.
 */
export function useViewPayload<L extends ViewLevel>(
  level: L,
  subjectId: string | undefined,
  options: ReadOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.view(level, subjectId ?? '', options),
    queryFn:
      subjectId === undefined
        ? skipToken
        : ({ signal }) => fetchData<ViewPayload<L>>(viewRequest(level, subjectId, options), signal),
    staleTime: Infinity,
    // Entering or leaving edit mode refetches with or without drafts; meanwhile the view keeps
    // showing what it had, instead of going blank. Only for the same subject: another map's
    // payload must never stand in.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === subjectId ? previous : undefined,
  });
}

/** A map's events, in date order, with where each is (M6-T7). */
export function useEventList(mapId: string | undefined, options: ReadOptions = {}) {
  return useQuery({
    queryKey: queryKeys.eventList(mapId ?? '', options),
    queryFn:
      mapId === undefined
        ? skipToken
        : ({ signal }) => fetchData<EventList>(eventListRequest(mapId, options), signal),
    // As the views: it changes only when the owner edits, which refreshes it.
    staleTime: Infinity,
  });
}

/**
 * All of a universe's records of a config resource (field definitions, object subtypes…), in
 * the owner's order: by `sortKey`, set by dragging rows on the settings page (M4-T1). There are
 * few, so one page holds them; they change only when the owner edits settings.
 */
export function useConfigList<R extends ConfigResource>(
  resource: R,
  universeId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.configList(resource, universeId ?? ''),
    queryFn:
      universeId === undefined
        ? skipToken
        : async ({ signal }) =>
            (
              await fetchData<{ data: ConfigReadOf<R>[] }>(
                configListRequest(resource, universeId),
                signal,
              )
            ).data,
    select: inSortOrder,
    staleTime: Infinity,
  });
}

/**
 * The settings order: by sort key, then by id (creation order, as ids are UUIDv7). Every config
 * record has both; the generic read type just can't show it.
 */
export function inSortOrder<T>(items: T[]): T[] {
  const key = (item: T) => item as { sortKey?: number; id?: string };
  return items.toSorted((a, b) => {
    const [x, y] = [key(a), key(b)];
    const byKey = (x.sortKey ?? 0) - (y.sortKey ?? 0);
    if (byKey !== 0) return byKey;
    return (x.id ?? '').localeCompare(y.id ?? '');
  });
}
