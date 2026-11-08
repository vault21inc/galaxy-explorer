import { schema, type Executor } from '@ge/db';
import type { OrbitView, ViewPin } from '@ge/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { named, published } from './view-common.ts';
import type { Viewer } from './visibility.ts';

/**
 * The pins of an orbit view (E3, E4): places and events located on the subject, either on its
 * surface (latitude and longitude) or at the body itself, plus events located at one of those
 * places, which use that place's coordinates.
 */

const { entities, entityLocations, events } = schema;

const pinColumns = {
  id: entities.id,
  kind: entities.kind,
  name: entities.name,
  namePlain: entities.namePlain,
  isSpoiler: entities.isSpoiler,
  status: entities.status,
  mode: entityLocations.mode,
  latDeg: entityLocations.latDeg,
  lonDeg: entityLocations.lonDeg,
  placeId: entityLocations.placeId,
  locationSpoiler: entityLocations.isSpoiler,
  categoryId: events.categoryId,
  dateText: events.dateText,
};

function selectPins(ex: Executor, where: ReturnType<typeof and>) {
  return ex
    .select(pinColumns)
    .from(entityLocations)
    .innerJoin(entities, eq(entities.id, entityLocations.entityId))
    .leftJoin(events, eq(events.entityId, entities.id))
    .where(where)
    .orderBy(entities.id);
}

type PinRow = Awaited<ReturnType<typeof selectPins>>[number];

function toPin(row: PinRow, at?: PinRow): ViewPin {
  return {
    id: row.id as ViewPin['id'],
    kind: row.kind as ViewPin['kind'],
    ...named(row),
    status: row.status as ViewPin['status'],
    mode: row.mode as ViewPin['mode'],
    // A pin at a place sits where that place is.
    latDeg: at ? at.latDeg : row.latDeg,
    lonDeg: at ? at.lonDeg : row.lonDeg,
    placeId: row.placeId as ViewPin['placeId'],
    // Hidden if either location is: showing the event would reveal the place.
    locationSpoiler: row.locationSpoiler || (at?.locationSpoiler ?? false),
    categoryId: row.categoryId as ViewPin['categoryId'],
    dateText: row.dateText,
  };
}

export async function loadPins(
  ex: Executor,
  subjectId: string,
  viewer: Viewer,
): Promise<OrbitView['pins']> {
  const onSubject = await selectPins(
    ex,
    and(
      eq(entityLocations.objectId, subjectId),
      inArray(entityLocations.mode, ['surface', 'object']),
      published(viewer),
    ),
  );
  const places = onSubject.filter((pin) => pin.kind === 'place');
  const atPlaces = places.length
    ? await selectPins(
        ex,
        and(
          eq(entityLocations.mode, 'place'),
          inArray(
            entityLocations.placeId,
            places.map((place) => place.id),
          ),
          published(viewer),
        ),
      )
    : [];
  const placeById = new Map(places.map((place) => [place.id, place]));
  return [
    ...onSubject.map((pin) => toPin(pin)),
    ...atPlaces.map((pin) => toPin(pin, placeById.get(pin.placeId ?? ''))),
  ];
}
