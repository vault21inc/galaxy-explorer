import { createDrawnIndex } from '../drawn-index.ts';
import type { RouteShape } from './route-shapes.ts';

/**
 * The routes drawn now (M4-T7): `RouteLines` publishes their shapes; the label layer puts each
 * name on its line, the selection rings ring a selected route's waypoints, and the test hooks
 * report them. Routes are also in the scene index, as curves, so the picker can hit them.
 */
const index = createDrawnIndex<RouteShape>();

export const publishRoutes = index.publish;
export const drawnRoutes = index.all;
export const drawnRoute = index.get;
export const useDrawnRoutes = index.useAll;
