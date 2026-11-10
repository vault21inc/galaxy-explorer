import { schema, type Executor } from '@ge/db';
import type { GalaxyView } from '@ge/domain';
import { and, asc, eq } from 'drizzle-orm';
import { named, published } from './view-common.ts';
import type { Viewer } from './visibility.ts';

/** The galaxy view's routes (M4-T7). */

const { entities, routes, routeWaypoints } = schema;

type ViewRoute = GalaxyView['routes'][number];

/**
 * A map's routes with their waypoints in order. Waypoints the view doesn't show (drafts, for a
 * reader) are left out, and the line goes straight from the one before to the one after; if
 * that leaves the same object twice in a row, it's kept once.
 */
export async function loadRoutes(
  ex: Executor,
  mapId: string,
  viewer: Viewer,
  shownObjects: ReadonlySet<string>,
): Promise<ViewRoute[]> {
  const routeRows = await ex
    .select({
      id: entities.id,
      version: entities.version,
      name: entities.name,
      namePlain: entities.namePlain,
      isSpoiler: entities.isSpoiler,
      status: entities.status,
      style: routes.style,
    })
    .from(entities)
    .innerJoin(routes, eq(routes.entityId, entities.id))
    .where(and(eq(routes.mapId, mapId), published(viewer)))
    .orderBy(asc(entities.id));
  if (routeRows.length === 0) return [];
  const waypoints = await ex
    .select({ routeId: routeWaypoints.routeId, objectId: routeWaypoints.objectId })
    .from(routeWaypoints)
    .where(eq(routeWaypoints.mapId, mapId))
    .orderBy(asc(routeWaypoints.routeId), asc(routeWaypoints.seq));

  const byRoute = new Map<string, string[]>();
  for (const { routeId, objectId } of waypoints) {
    if (!shownObjects.has(objectId)) continue;
    const list = byRoute.get(routeId) ?? [];
    if (list.at(-1) !== objectId) list.push(objectId);
    byRoute.set(routeId, list);
  }
  return routeRows.map((route) => ({
    id: route.id as ViewRoute['id'],
    version: route.version,
    ...named(route),
    status: route.status as 'draft' | 'published',
    style: route.style,
    waypoints: (byRoute.get(route.id) ?? []) as ViewRoute['waypoints'],
  }));
}
