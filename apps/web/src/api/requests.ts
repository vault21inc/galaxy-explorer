import {
  configResources,
  entityKinds,
  viewLevels,
  type ConfigResource,
  type EntityInclude,
  type EntityKind,
  type ViewLevel,
} from '@ge/domain';

/**
 * Where each registry-derived request goes, as pure functions of the registries
 * (architecture.md §3). The hooks in `hooks.ts` and their query keys come from these, so no
 * kind or level is named anywhere in the data layer. A unit test checks every path they build
 * against the API's OpenAPI document.
 */

/** What every read accepts (architecture.md §5). Spoiler handling arrives in M2-T7. */
export interface ReadOptions {
  spoilers?: 'include' | 'exclude';
  /** Editors only: include unpublished drafts (edit mode, architecture.md §10). */
  includeDrafts?: true;
}

export interface EntityOptions extends ReadOptions {
  /** Aspects to load with the entity, such as facts and links (data-model §3.4). */
  include?: readonly EntityInclude[];
}

/** Where a kind's list lives: its map, or its universe for universe-scoped kinds. */
export type EntityScope<K extends EntityKind> = (typeof entityKinds)[K]['scope'] extends 'map'
  ? { mapId: string }
  : { universeId: string };

/**
 * List filters: equality on extension fields (`parentId: null` for the top level), plus the
 * name search, status and paging every list has.
 */
export interface ListFilters extends ReadOptions {
  q?: string;
  status?: 'draft' | 'published';
  limit?: number;
  cursor?: string;
  [extensionField: string]: string | number | boolean | null | undefined;
}

export type Query = Record<string, string | number | boolean>;

/** A request as a path template (as the OpenAPI document names it), its path values and query. */
export interface RequestSpec {
  template: string;
  path: Record<string, string>;
  query: Query;
}

export function entityRequest(kind: EntityKind, id: string, options: EntityOptions = {}) {
  const { include, ...rest } = options;
  const query: Query = { ...definedOnly(rest) };
  if (include && include.length > 0) query.include = [...include].sort().join(',');
  return {
    template: `/api/v1/${entityKinds[kind].plural}/{id}`,
    path: { id },
    query,
  } satisfies RequestSpec;
}

export function entityListRequest<K extends EntityKind>(
  kind: K,
  scope: EntityScope<K>,
  filters: ListFilters = {},
): RequestSpec {
  const { plural } = entityKinds[kind];
  const query: Query = {};
  for (const [name, value] of Object.entries(filters)) {
    // The API takes "null" for "has no value", such as `parentId=null` (entity-schemas.ts).
    if (value !== undefined) query[name] = value ?? 'null';
  }
  if ('mapId' in scope) {
    return { template: `/api/v1/maps/{mapId}/${plural}`, path: { mapId: scope.mapId }, query };
  }
  return {
    template: `/api/v1/universes/{universeId}/${plural}`,
    path: { universeId: scope.universeId },
    query,
  };
}

/**
 * A view's payload. The galaxy view's subject is the map; the other levels' subject is the
 * object being viewed (view-levels.ts).
 */
export function viewRequest(
  level: ViewLevel,
  subjectId: string,
  options: ReadOptions = {},
): RequestSpec {
  const query = definedOnly(options);
  if (viewLevels[level].subject === 'map') {
    return { template: `/api/v1/maps/{mapId}/views/${level}`, path: { mapId: subjectId }, query };
  }
  return { template: `/api/v1/objects/{id}/views/${level}`, path: { id: subjectId }, query };
}

/** A map's events list (M6-T7). */
export function eventListRequest(mapId: string, options: ReadOptions = {}): RequestSpec {
  return {
    template: '/api/v1/maps/{mapId}/event-list',
    path: { mapId },
    query: definedOnly(options),
  };
}

function definedOnly(options: object): Query {
  return Object.fromEntries(
    Object.entries(options as Record<string, Query[string] | undefined>).filter(
      (entry): entry is [string, Query[string]] => entry[1] !== undefined,
    ),
  );
}

/** A universe's list of a config resource, such as its field definitions (architecture.md §5). */
export function configListRequest(resource: ConfigResource, universeId: string): RequestSpec {
  return {
    template: `/api/v1/universes/{universeId}/${configResources[resource].plural}`,
    path: { universeId },
    query: { limit: 1_000 },
  };
}

/** One config record, to update (PATCH) or delete (M4-T1). Creating posts to the list. */
export function configItemRequest(resource: ConfigResource, id: string): RequestSpec {
  return { template: `/api/v1/${configResources[resource].plural}/{id}`, path: { id }, query: {} };
}

/** Creating an entity of a kind in its map, or its universe for universe-scoped kinds. */
export function entityCreateRequest<K extends EntityKind>(
  kind: K,
  scope: EntityScope<K>,
): RequestSpec {
  return { ...entityListRequest(kind, scope), query: {} };
}

/** Updating (PATCH) one entity of a kind. */
export function entityUpdateRequest(kind: EntityKind, id: string): RequestSpec {
  return { ...entityRequest(kind, id), query: {} };
}
