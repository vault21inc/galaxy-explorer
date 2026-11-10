import { rt, type BatchRequest } from '@ge/domain';

/**
 * Making routes (M4-T7, ux.md §5) as pure functions: the waypoints a click adds, and the batch
 * that creates a route through objects in order.
 */

/**
 * The waypoints after clicking `id` in the Route tool: added at the end, unless it is already
 * the last one (a segment needs two different ends). Going back to an earlier one is allowed:
 * a round trip passes it again.
 */
export function addWaypoint(waypoints: readonly string[], id: string): string[] {
  return waypoints.at(-1) === id ? [...waypoints] : [...waypoints, id];
}

/** A new route's name from its ends: "Aster to Corvid". */
export function routeName(firstName: string, lastName: string): string {
  return firstName === lastName ? `${firstName} round trip` : `${firstName} to ${lastName}`;
}

/** One batch: create the route, then set its waypoints. Null with fewer than two waypoints. */
export function createRouteRequest(
  mapId: string,
  objectIds: readonly string[],
  name: string,
): BatchRequest | null {
  const waypoints = objectIds.filter((id, index) => objectIds[index - 1] !== id);
  if (waypoints.length < 2) return null;
  return {
    description: `Create route “${name}”`,
    operations: [
      { op: 'create', kind: 'route', mapId, data: { name: rt.plain(name) } },
      { op: 'setWaypoints', id: '$op:0', data: waypoints },
    ],
  };
}
