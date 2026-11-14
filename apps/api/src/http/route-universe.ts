import { CONFIG_TABLES, schema, type Executor } from '@ge/db';
import { configResources, entityKinds, type ConfigResource, type EntityKind } from '@ge/domain';
import { eq } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * Which universe a route is about (M8-T11), found from its path parameters: a `mapId` is looked
 * up in `maps`, an entity's `id` in `entities`, and so on. Every content row carries its
 * `universe_id`, so the universe always comes from the row itself, never from an id the client
 * sent alongside.
 *
 * A parameter not listed here, or in `WITHIN_PARENT`, makes the route unclassifiable, which the
 * access guard refuses and the access contract suite fails on: a new kind of path parameter has
 * to be taught here first.
 */

const { assets, changeBatches, entities, fieldDefinitions, maps, universes } = schema;

/** A table with an `id` and a `universe_id`, and what to call one of its rows. */
interface Source {
  what: string;
  table: PgTable;
  id: PgColumn;
  universeId: PgColumn;
}

const source = (what: string, table: PgTable & { id: PgColumn; universeId: PgColumn }): Source => ({
  what,
  table,
  id: table.id,
  universeId: table.universeId,
});

const ENTITY = source('entity', entities);

/** By the route's first segment, such as `objects` or `group-types`: whose `{id}` it is. */
const ID_SOURCES = new Map<string, Source>([
  ...(Object.keys(entityKinds) as EntityKind[]).map(
    (kind) =>
      [
        entityKinds[kind].plural,
        source(entityKinds[kind].label.one.toLowerCase(), entities),
      ] as const,
  ),
  ...(Object.keys(configResources) as ConfigResource[]).map(
    (resource) =>
      [
        configResources[resource].plural,
        source(configResources[resource].label.one.toLowerCase(), CONFIG_TABLES[resource]),
      ] as const,
  ),
]);

/** Parameters that name a row with its own universe. `id` depends on the route (above). */
const PARAM_SOURCES: Record<string, Source> = {
  universeId: { what: 'universe', table: universes, id: universes.id, universeId: universes.id },
  mapId: source('map', maps),
  entityId: ENTITY,
  groupId: source('group', entities),
  routeId: source('route', entities),
  batchId: source('change batch', changeBatches),
  assetId: source('asset', assets),
  fieldDefinitionId: source('field definition', fieldDefinitions),
};

/**
 * Parameters that name something inside another parameter's row, which the route's service
 * finds through that row (a link of `entityId`, a map's key): they need no universe of their own.
 */
export const WITHIN_PARENT: ReadonlySet<string> = new Set([
  'linkId',
  'relationId',
  'citationId',
  'externalKey',
  'role',
]);

/** Every parameter the access check knows: the contract suite fails on any other. */
export const KNOWN_PARAMS: ReadonlySet<string> = new Set([
  'id',
  ...Object.keys(PARAM_SOURCES),
  ...WITHIN_PARENT,
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The parameter names in a route's URL, such as `['mapId', 'externalKey']`. */
export function paramsOf(url: string): string[] {
  return [...url.matchAll(/[:{]([A-Za-z]+)\}?/g)].map((match) => match[1] ?? '');
}

/** Whether a route's URL names a universe, directly or through one of its rows. */
export function namesUniverse(url: string): boolean {
  return paramsOf(url).some((name) => name === 'id' || name in PARAM_SOURCES);
}

function sourceFor(url: string, name: string): Source | undefined {
  if (name !== 'id') return PARAM_SOURCES[name];
  // `/api/v1/objects/:id/views/system` → objects
  const segment = url.replace(/^\/api\/v1\//, '').split('/')[0] ?? '';
  return ID_SOURCES.get(segment);
}

export type RouteUniverse =
  /**
   * The universe the route's rows belong to (null for a batch that never recorded one), and the
   * first row named, for a 404 that reads exactly like a missing row's.
   */
  | { found: true; universeId: string | null; what: string; id: string }
  /** A named row doesn't exist (or isn't in the same universe as the others): a 404. */
  | { found: false; what: string; id: string }
  /** A parameter this file doesn't know. */
  | { found: 'unknown'; param: string };

/**
 * Looks up the universe of each id in a route's path. They must all agree: an image route's
 * entity and asset in two different universes is as good as a missing row.
 */
export async function routeUniverse(
  ex: Executor,
  url: string,
  params: Record<string, string>,
): Promise<RouteUniverse | null> {
  let universeId: string | null | undefined;
  let first: { what: string; id: string } | undefined;
  for (const name of paramsOf(url)) {
    if (WITHIN_PARENT.has(name)) continue;
    const from = sourceFor(url, name);
    if (!from) return { found: 'unknown', param: name };
    const id = params[name] ?? '';
    // Not an id at all: left to the route's own validation, which answers 400.
    if (!UUID.test(id)) return null;
    const [row] = await ex
      .select({ universeId: from.universeId })
      .from(from.table)
      .where(eq(from.id, id));
    const rowUniverse = row?.universeId as string | null | undefined;
    if (row === undefined || (universeId !== undefined && rowUniverse !== universeId)) {
      return { found: false, what: from.what, id };
    }
    universeId = rowUniverse ?? null;
    first ??= { what: from.what, id };
  }
  return universeId === undefined || !first ? null : { found: true, universeId, ...first };
}
