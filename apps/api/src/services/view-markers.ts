import { schema, type Executor } from '@ge/db';
import type { ViewMarker } from '@ge/domain';
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { named, published } from './view-common.ts';
import type { Viewer } from './visibility.ts';

/**
 * The event markers of a galaxy or system view (E3, M6-T5): events outside any globe.
 * - In the galaxy view: in deep space (mode `space` with no frame object), or at one of the
 *   view's top-level objects, such as a system or a nebula (mode `object`).
 * - In a system view: in space in that system's frame.
 * Events on a planet or moon are its orbit view's pins instead (view-pins.ts).
 */

const { entities, entityLocations, events } = schema;

function selectMarkers(ex: Executor, where: SQL | undefined) {
  return ex
    .select({
      id: entities.id,
      kind: entities.kind,
      version: entities.version,
      name: entities.name,
      namePlain: entities.namePlain,
      isSpoiler: entities.isSpoiler,
      status: entities.status,
      mode: entityLocations.mode,
      objectId: entityLocations.objectId,
      x: entityLocations.x,
      y: entityLocations.y,
      z: entityLocations.z,
      locationSpoiler: entityLocations.isSpoiler,
      categoryId: events.categoryId,
      dateText: events.dateText,
    })
    .from(entityLocations)
    .innerJoin(entities, eq(entities.id, entityLocations.entityId))
    .innerJoin(events, eq(events.entityId, entities.id))
    .where(where)
    .orderBy(entities.id);
}

type MarkerRow = Awaited<ReturnType<typeof selectMarkers>>[number];

function toMarker(row: MarkerRow): ViewMarker {
  const space = row.mode === 'space';
  return {
    id: row.id as ViewMarker['id'],
    kind: 'event',
    version: row.version,
    ...named(row),
    status: row.status as ViewMarker['status'],
    mode: space ? 'space' : 'object',
    objectId: space ? null : (row.objectId as ViewMarker['objectId']),
    position: space ? [row.x ?? 0, row.y ?? 0, row.z ?? 0] : null,
    locationSpoiler: row.locationSpoiler,
    categoryId: row.categoryId as ViewMarker['categoryId'],
    dateText: row.dateText,
  };
}

/** The galaxy view's markers: deep space, and at the given top-level objects. */
export async function loadGalaxyMarkers(
  ex: Executor,
  mapId: string,
  objectIds: readonly string[],
  viewer: Viewer,
): Promise<ViewMarker[]> {
  const deepSpace = and(eq(entityLocations.mode, 'space'), isNull(entityLocations.objectId));
  const atObjects =
    objectIds.length > 0
      ? and(eq(entityLocations.mode, 'object'), inArray(entityLocations.objectId, [...objectIds]))
      : undefined;
  const rows = await selectMarkers(
    ex,
    and(
      eq(entityLocations.mapId, mapId),
      atObjects ? or(deepSpace, atObjects) : deepSpace,
      published(viewer),
    ),
  );
  return rows.map(toMarker);
}

/** A system view's markers: in space in its frame. */
export async function loadSystemMarkers(
  ex: Executor,
  systemId: string,
  viewer: Viewer,
): Promise<ViewMarker[]> {
  const rows = await selectMarkers(
    ex,
    and(
      eq(entityLocations.mode, 'space'),
      eq(entityLocations.objectId, systemId),
      published(viewer),
    ),
  );
  return rows.map(toMarker);
}
