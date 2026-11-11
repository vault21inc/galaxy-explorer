import { isPlanetType, type BaseType, type LOCATION_MODES } from '@ge/domain';
import { unwrap } from '@ge/api-client';
import { api } from '@/api/client.ts';
import { viewNavigation } from '@/state/view-navigator.ts';

/** What `shownWhere` needs of a location: its mode and the ids it points at. */
export interface LocationRef {
  mode: (typeof LOCATION_MODES)[number];
  objectId: string | null;
  placeId: string | null;
}

/** What `shownWhere` needs of the object a location is at. */
export interface ObjectRef {
  baseType: BaseType;
  parentId: string | null;
}

/**
 * Which view shows a located place or event, and what to select there (M6-T6, E3):
 * - on a surface: the body's orbit view, with its pin;
 * - at a planet or moon: its orbit view too, with the pin standing at the body;
 * - at a top-level object (a system, a nebula): the galaxy view, with its marker beside it;
 * - at anything else (a station in a system): that object's own view, or the one it's in,
 *   selecting the object, since nothing draws the event there;
 * - in space: the system whose frame it's in, or the galaxy view (null) for deep space;
 * - at a place: wherever the place is shown, selecting the event beside the place's pin.
 * Pure but for its two lookups, so it's unit-tested with fakes.
 */
export async function shownWhere(
  id: string,
  location: LocationRef,
  lookups: {
    location: (id: string) => Promise<LocationRef | null>;
    object: (id: string) => Promise<ObjectRef>;
  },
): Promise<{ objectId: string | null; select: string }> {
  switch (location.mode) {
    case 'surface':
      return { objectId: location.objectId, select: id };
    case 'space':
      return { objectId: location.objectId, select: id };
    case 'object': {
      if (location.objectId === null) return { objectId: null, select: id };
      const object = await lookups.object(location.objectId);
      if (isPlanetType(object.baseType)) return { objectId: location.objectId, select: id };
      if (object.parentId === null) return { objectId: null, select: id };
      return { objectId: location.objectId, select: location.objectId };
    }
    case 'place': {
      const place = location.placeId ? await lookups.location(location.placeId) : null;
      if (!place || place.mode === 'place') return { objectId: null, select: id };
      return { ...(await shownWhere(id, place, lookups)), select: id };
    }
  }
}

const apiLookups = {
  location: (entityId: string) =>
    unwrap(api.GET('/api/v1/entities/{entityId}/location', { params: { path: { entityId } } })),
  object: (objectId: string) =>
    unwrap(api.GET('/api/v1/objects/{id}', { params: { path: { id: objectId } } })),
};

/**
 * Goes to an event (or place) in the views (M6-T6): from a character's events, the views
 * change one after another to the one that shows it (ux.md §9), with it selected. One that's
 * nowhere yet opens its map's galaxy view with it selected, so its panel shows.
 */
export async function goToLocated(id: string, mapId: string | null): Promise<void> {
  const location = await apiLookups.location(id);
  const target = location
    ? await shownWhere(id, location, apiLookups)
    : { objectId: null, select: id };
  viewNavigation.show(target.objectId, { select: target.select, mapId });
}
