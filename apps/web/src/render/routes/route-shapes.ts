import {
  isHidden,
  spoilerKeys,
  type SpoilerPolicy,
  type ViewObject,
  type ViewRoute,
} from '@ge/domain';
import { hexToLinear } from '../color.ts';
import { labelText } from '../labels/label-text.ts';
import { REDACTION_COLOR, ROUTE_COLOR, ROUTE_LINE_WIDTH_PX } from '../tuning.ts';

/** A world point, in the view's unit. */
export type WorldPoint = readonly [number, number, number];

/** One route as drawn (rendering.md §6, M4-T7): its line through its waypoints, look and label. */
export interface RouteShape {
  id: string;
  /** Each waypoint's center, in order. */
  points: WorldPoint[];
  /** The object at each point, so a move in progress can shift its points. */
  waypointIds: string[];
  color: string;
  dashed: boolean;
  widthPx: number;
  label: string;
  /** A hidden spoiler route: grey, with a redacted label (ux.md §7). */
  redacted: boolean;
  draft: boolean;
}

type Route = Pick<
  ViewRoute,
  | 'id'
  | 'style'
  | 'waypoints'
  | 'status'
  | 'isSpoiler'
  | 'namePlain'
  | 'nameSpoiler'
  | 'nameRedacted'
>;
type Placed = Pick<ViewObject, 'id' | 'position'>;

/**
 * Every route's shape, from the galaxy view's routes and objects. A waypoint the view doesn't
 * draw is skipped (the server already leaves out what a reader can't see), and a route with
 * fewer than two points left isn't drawn.
 */
export function routeShapes(
  routes: readonly Route[],
  objects: readonly Placed[],
  policy: SpoilerPolicy,
): RouteShape[] {
  const positions = new Map(objects.map((object) => [object.id as string, object.position]));
  return routes.flatMap((route): RouteShape[] => {
    const waypointIds = route.waypoints.filter((id) => positions.has(id));
    if (waypointIds.length < 2) return [];
    const redacted = isHidden(route.isSpoiler, spoilerKeys.record(route.id), policy);
    return [
      {
        id: route.id,
        points: waypointIds.map((id) => positions.get(id) ?? [0, 0, 0]),
        waypointIds,
        color: redacted ? REDACTION_COLOR : (route.style.color ?? ROUTE_COLOR),
        dashed: route.style.dashed ?? false,
        widthPx: route.style.widthPx ?? ROUTE_LINE_WIDTH_PX,
        label: labelText(route, policy),
        redacted,
        draft: route.status === 'draft',
      },
    ];
  });
}

/**
 * Where a route's label goes: the middle of its middle segment (M4-T7), so it sits on the line
 * however long the route is. For an even number of segments that's the one just before the
 * middle point. Null for fewer than two points.
 */
export function routeLabelAnchor(points: readonly WorldPoint[]): [number, number, number] | null {
  if (points.length < 2) return null;
  const segment = Math.floor((points.length - 2) / 2);
  const from = points[segment];
  const to = points[segment + 1];
  if (!from || !to) return null;
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
}

/** The arrays for one merged batch of route lines (`LineSegmentsGeometry`). */
export interface RouteBuffers {
  /** Per segment: start x, y, z, then end x, y, z. */
  positions: Float32Array;
  /** Per segment: the start's linear r, g, b, then the end's (one color per route). */
  colors: Float32Array;
  /** Per segment: the line width in CSS pixels (the `instanceWidth` attribute). */
  widths: Float32Array;
  /** Per segment: the ids of the objects at its start and end, for a move in progress. */
  ends: string[];
  segmentCount: number;
}

/**
 * Every route of these shapes merged into one batch: one draw call however many routes. A
 * route of n points is n − 1 segments; routes don't join each other, unlike an outline's loop.
 */
export function buildRouteBuffers(shapes: readonly RouteShape[]): RouteBuffers {
  const segmentCount = shapes.reduce((sum, shape) => sum + shape.points.length - 1, 0);
  const buffers: RouteBuffers = {
    positions: new Float32Array(segmentCount * 6),
    colors: new Float32Array(segmentCount * 6),
    widths: new Float32Array(segmentCount),
    ends: new Array<string>(segmentCount * 2),
    segmentCount,
  };
  let segment = 0;
  for (const shape of shapes) {
    const [r, g, b] = hexToLinear(shape.color);
    for (let index = 0; index + 1 < shape.points.length; index++) {
      const from = shape.points[index] ?? [0, 0, 0];
      const to = shape.points[index + 1] ?? [0, 0, 0];
      buffers.positions.set([...from, ...to], segment * 6);
      buffers.colors.set([r, g, b, r, g, b], segment * 6);
      buffers.widths[segment] = shape.widthPx;
      buffers.ends[segment * 2] = shape.waypointIds[index] ?? '';
      buffers.ends[segment * 2 + 1] = shape.waypointIds[index + 1] ?? '';
      segment++;
    }
  }
  return buffers;
}

/**
 * Writes the segment ends into `target` from `base`, with the ends at objects in `ids` shifted
 * by `delta`: how a move in progress (M3-T3) drags the lines along. Allocates nothing.
 */
export function shiftRouteEnds(
  base: Float32Array,
  target: Float32Array,
  ends: readonly string[],
  ids: ReadonlySet<string> | null,
  delta: readonly [number, number, number],
): void {
  target.set(base);
  if (!ids) return;
  for (let end = 0; end < ends.length; end++) {
    if (!ids.has(ends[end] ?? '')) continue;
    target[end * 3] = (base[end * 3] ?? 0) + delta[0];
    target[end * 3 + 1] = (base[end * 3 + 1] ?? 0) + delta[1];
    target[end * 3 + 2] = (base[end * 3 + 2] ?? 0) + delta[2];
  }
}
