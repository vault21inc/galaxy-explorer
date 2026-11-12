import { schema, type Executor } from '@ge/db';
import type { EventList, EventListItem, LocationStep } from '@ge/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { getMap } from './container-service.ts';
import { named, published } from './view-common.ts';
import type { Viewer } from './visibility.ts';

/**
 * A map's events list (M6-T7): every event the viewer may see, in date order, each with where
 * it is as a path of names. The path is built from a few batched reads, not one per event:
 * the events with their locations, then the places they're at, then the objects and their
 * ancestors, a level at a time.
 */

const { entities, entityLocations, events, celestialObjects } = schema;

/** At most this many levels up from a location's object: galaxy › system › planet › moon. */
const MAX_DEPTH = 8;

interface LocationRow {
  mode: string;
  objectId: string | null;
  placeId: string | null;
  isSpoiler: boolean;
}

interface Node {
  step: LocationStep;
  parentId: string | null;
}

export async function eventList(ex: Executor, mapId: string, viewer: Viewer): Promise<EventList> {
  const map = await getMap(ex, mapId, viewer);
  const rows = await ex
    .select({
      id: entities.id,
      version: entities.version,
      name: entities.name,
      namePlain: entities.namePlain,
      isSpoiler: entities.isSpoiler,
      status: entities.status,
      categoryId: events.categoryId,
      dateText: events.dateText,
      dateSort: events.dateSort,
      mode: entityLocations.mode,
      objectId: entityLocations.objectId,
      placeId: entityLocations.placeId,
      locationSpoiler: entityLocations.isSpoiler,
    })
    .from(events)
    .innerJoin(entities, eq(entities.id, events.entityId))
    .leftJoin(entityLocations, eq(entityLocations.entityId, entities.id))
    .where(and(eq(events.mapId, mapId), published(viewer)));

  // The places the events are at, with their own locations.
  const placeIds = [...new Set(rows.flatMap((row) => (row.placeId ? [row.placeId] : [])))];
  const places = placeIds.length
    ? await ex
        .select({
          id: entities.id,
          name: entities.name,
          namePlain: entities.namePlain,
          isSpoiler: entities.isSpoiler,
          mode: entityLocations.mode,
          objectId: entityLocations.objectId,
          placeId: entityLocations.placeId,
          locationSpoiler: entityLocations.isSpoiler,
        })
        .from(entities)
        .leftJoin(entityLocations, eq(entityLocations.entityId, entities.id))
        .where(and(inArray(entities.id, placeIds), published(viewer)))
    : [];
  const placeById = new Map(places.map((place) => [place.id, place]));

  // The objects named in any location, then their parents, until the top.
  const nodes = new Map<string, Node>();
  let wanted = new Set<string>();
  for (const location of [...rows, ...places]) if (location.objectId) wanted.add(location.objectId);
  for (let depth = 0; wanted.size > 0 && depth < MAX_DEPTH; depth++) {
    const found = await ex
      .select({
        id: entities.id,
        name: entities.name,
        namePlain: entities.namePlain,
        isSpoiler: entities.isSpoiler,
        parentId: celestialObjects.parentId,
      })
      .from(entities)
      .innerJoin(celestialObjects, eq(celestialObjects.entityId, entities.id))
      .where(and(inArray(entities.id, [...wanted]), published(viewer)));
    const next = new Set<string>();
    for (const object of found) {
      nodes.set(object.id, {
        step: { id: object.id as LocationStep['id'], kind: 'celestial_object', ...named(object) },
        parentId: object.parentId,
      });
      if (object.parentId && !nodes.has(object.parentId)) next.add(object.parentId);
    }
    wanted = next;
  }

  /** An object and its ancestors, outermost first; ones the viewer can't see are left out. */
  const objectPath = (id: string | null): LocationStep[] => {
    const path: LocationStep[] = [];
    for (let at = id, depth = 0; at !== null && depth < MAX_DEPTH; depth++) {
      const node = nodes.get(at);
      if (!node) break;
      path.unshift(node.step);
      at = node.parentId;
    }
    return path;
  };
  const pathOf = (location: LocationRow): LocationStep[] => {
    if (location.mode !== 'place') return objectPath(location.objectId);
    const place = location.placeId ? placeById.get(location.placeId) : undefined;
    if (!place) return [];
    const step: LocationStep = {
      id: place.id as LocationStep['id'],
      kind: 'place',
      ...named(place),
    };
    return [...(place.mode && place.mode !== 'place' ? objectPath(place.objectId) : []), step];
  };

  const items = rows.map((row): EventListItem => {
    const place = row.placeId ? placeById.get(row.placeId) : undefined;
    return {
      id: row.id as EventListItem['id'],
      version: row.version,
      ...named(row),
      status: row.status as EventListItem['status'],
      categoryId: row.categoryId as EventListItem['categoryId'],
      dateText: row.dateText,
      dateSort: row.dateSort,
      location:
        row.mode === null
          ? null
          : {
              mode: row.mode as NonNullable<EventListItem['location']>['mode'],
              // An event at a spoiler place gives that place away too.
              isSpoiler: (row.locationSpoiler ?? false) || (place?.locationSpoiler ?? false),
              path: pathOf({
                mode: row.mode,
                objectId: row.objectId,
                placeId: row.placeId,
                isSpoiler: row.locationSpoiler ?? false,
              }),
            },
    };
  });
  return {
    map: { id: map.id, universeId: map.universeId },
    events: items.toSorted(byDate),
  };
}

/** By `dateSort`, then `dateText`, then name; undated after dated at each step. */
export function byDate(
  a: Pick<EventListItem, 'dateSort' | 'dateText' | 'namePlain'>,
  b: Pick<EventListItem, 'dateSort' | 'dateText' | 'namePlain'>,
): number {
  if (a.dateSort !== b.dateSort) {
    if (a.dateSort === null) return 1;
    if (b.dateSort === null) return -1;
    return a.dateSort - b.dateSort;
  }
  if (a.dateText !== b.dateText) {
    if (a.dateText === null) return 1;
    if (b.dateText === null) return -1;
    return a.dateText.localeCompare(b.dateText);
  }
  return a.namePlain.localeCompare(b.namePlain);
}
