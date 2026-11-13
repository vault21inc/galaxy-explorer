import { schema, type Executor } from '@ge/db';
import {
  CONFIG_RESOURCES,
  ENTITY_KINDS,
  entityKinds,
  type ConfigResource,
  type EntityKind,
  type MapRead,
  type UniverseRead,
} from '@ge/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { listConfig } from '../services/config-service.ts';
import { getUniverse, listMaps } from '../services/container-service.ts';
import { listEntities } from '../services/entity-read.ts';
import { SEES_EVERYTHING } from '../services/visibility.ts';

/**
 * Everything an export holds, read in bulk (M7-T4): a query per table rather than per entity,
 * so a map of thousands of objects exports in seconds. Drafts and spoilers are included: an
 * export is the editor's copy.
 */

const {
  assets,
  citations,
  entities,
  entityImages,
  entityLinks,
  entityLocations,
  entityRelations,
  fieldValues,
  groupMembers,
  routeWaypoints,
} = schema;

type Row = Record<string, unknown>;
/** Rows of one table, by the entity they belong to. */
export type ByEntity<R = Row> = Map<string, R[]>;

export interface UniverseData {
  universe: z.infer<typeof UniverseRead>;
  maps: z.infer<typeof MapRead>[];
  assets: (typeof assets.$inferSelect)[];
  config: Record<ConfigResource, Row[]>;
  /** Each kind's entities, as the API reads them. */
  entities: Record<EntityKind, Row[]>;
  facts: ByEntity;
  images: ByEntity;
  links: ByEntity;
  citations: ByEntity;
  locations: Map<string, Row>;
  members: ByEntity;
  waypoints: ByEntity;
  relations: Row[];
}

/** No page limit: the loaders read every row in one go. */
const ALL = { limit: Number.MAX_SAFE_INTEGER };

function byEntity<R extends Row>(rows: readonly R[], key: keyof R = 'entityId'): ByEntity<R> {
  const grouped: ByEntity<R> = new Map();
  for (const row of rows) {
    const id = row[key] as string;
    const list = grouped.get(id);
    if (list) list.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

export async function loadUniverse(ex: Executor, universeId: string): Promise<UniverseData> {
  const universe = await getUniverse(ex, universeId);
  const maps = (await listMaps(ex, universeId, { viewer: SEES_EVERYTHING, ...ALL })).items;
  // The universe's entities, for the aspect tables that point at an entity rather than a map.
  const inUniverse = (column: PgColumn) =>
    inArray(
      column,
      ex.select({ id: entities.id }).from(entities).where(eq(entities.universeId, universeId)),
    );

  const config = {} as Record<ConfigResource, Row[]>;
  for (const resource of CONFIG_RESOURCES) {
    config[resource] = (await listConfig(ex, resource, universeId, ALL)).items;
  }
  const entityRows = {} as Record<EntityKind, Row[]>;
  for (const kind of ENTITY_KINDS) {
    const scopes =
      entityKinds[kind].scope === 'map' ? maps.map((map) => ({ mapId: map.id })) : [{ universeId }];
    entityRows[kind] = [];
    for (const scope of scopes) {
      const page = await listEntities(ex, kind, scope, { viewer: SEES_EVERYTHING, ...ALL });
      entityRows[kind].push(...(page.items as Row[]));
    }
  }

  const ordered = async (table: PgTable, column: PgColumn, ...order: PgColumn[]) =>
    (await ex
      .select()
      .from(table)
      .where(inUniverse(column))
      .orderBy(...order.map((item) => asc(item)))) as Row[];

  return {
    universe,
    maps,
    assets: await ex
      .select()
      .from(assets)
      .where(eq(assets.universeId, universeId))
      .orderBy(asc(assets.id)),
    config,
    entities: entityRows,
    facts: byEntity(await ordered(fieldValues, fieldValues.entityId, fieldValues.entityId)),
    images: byEntity(
      await ordered(entityImages, entityImages.entityId, entityImages.sortKey, entityImages.role),
    ),
    links: byEntity(
      await ordered(entityLinks, entityLinks.entityId, entityLinks.sortKey, entityLinks.id),
    ),
    citations: byEntity(
      await ordered(citations, citations.entityId, citations.target, citations.sourceUrl),
    ),
    locations: new Map(
      (await ordered(entityLocations, entityLocations.entityId, entityLocations.entityId)).map(
        (row) => [row.entityId as string, row],
      ),
    ),
    members: byEntity(await ordered(groupMembers, groupMembers.groupId), 'groupId'),
    waypoints: byEntity(
      await ordered(
        routeWaypoints,
        routeWaypoints.routeId,
        routeWaypoints.routeId,
        routeWaypoints.seq,
      ),
      'routeId',
    ),
    relations: await ex
      .select()
      .from(entityRelations)
      .where(eq(entityRelations.universeId, universeId))
      .orderBy(asc(entityRelations.sortKey), asc(entityRelations.id)),
  };
}
