import { schema, type Executor } from '@ge/db';
import { WaypointsWrite } from '@ge/domain';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { NotFound, RuleViolation } from '../errors.ts';
import { requireReferencedObject } from '../lookup.ts';
import { requireOwner } from './owner.ts';

/** A route's waypoints (M4-T7): the objects it passes through, in order. */

const { routeWaypoints } = schema;

/** The route, or a 404 when the id names anything else. */
export async function requireRoute(ex: Executor, routeId: string) {
  const owner = await requireOwner(ex, routeId);
  if (owner.kind !== 'route' || owner.mapId === null) throw new NotFound('route', routeId);
  return { ...owner, mapId: owner.mapId };
}

/**
 * Replaces a route's waypoints with these objects, in order. Each is a top-level object on the
 * route's map, as the galaxy view draws them. An object may come back later in the route (a
 * round trip), but not twice in a row: that would be a segment of no length.
 */
export async function setWaypoints(
  tx: Executor,
  routeId: string,
  input: z.input<typeof WaypointsWrite>,
) {
  const { objectIds } = WaypointsWrite.parse(input);
  const route = await requireRoute(tx, routeId);
  for (const [index, objectId] of objectIds.entries()) {
    const path = `/objectIds/${String(index)}`;
    const object = await requireReferencedObject(tx, objectId, route, path);
    if (object.parentId !== null) {
      throw new RuleViolation(
        `${object.namePlain} isn't a top-level object, so a route can't pass through it.`,
        path,
      );
    }
    if (index > 0 && objectIds[index - 1] === objectId) {
      throw new RuleViolation(`${object.namePlain} is twice in a row.`, path);
    }
  }
  await tx.delete(routeWaypoints).where(eq(routeWaypoints.routeId, routeId));
  if (objectIds.length > 0) {
    await tx
      .insert(routeWaypoints)
      .values(objectIds.map((objectId, seq) => ({ routeId, seq, mapId: route.mapId, objectId })));
  }
  return listWaypoints(tx, routeId);
}

export function listWaypoints(ex: Executor, routeId: string) {
  return ex
    .select({ seq: routeWaypoints.seq, objectId: routeWaypoints.objectId })
    .from(routeWaypoints)
    .where(eq(routeWaypoints.routeId, routeId))
    .orderBy(asc(routeWaypoints.seq));
}
