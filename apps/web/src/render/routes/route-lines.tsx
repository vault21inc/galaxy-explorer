import type { SpoilerPolicy, ViewObject, ViewRoute } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { InstancedBufferAttribute, type InterleavedBufferAttribute } from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { perSegmentWidthLineMaterial } from '../groups/line-material.ts';
import { movePreview, onMovePreview, publishDrawn, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import {
  ROUTE_DASH_PX,
  ROUTE_GAP_PX,
  ROUTE_LINE_RENDER_ORDER,
  ROUTE_PICK_HALF_WIDTH_PX,
  ROUTE_PICK_PRIORITY,
} from '../tuning.ts';
import { publishRoutes } from './route-index.ts';
import {
  buildRouteBuffers,
  routeShapes,
  shiftRouteEnds,
  type RouteBuffers,
  type RouteShape,
} from './route-shapes.ts';

const RENDERER = 'route-lines';

/**
 * Routes (rendering.md §6, M4-T7): every route's line through its waypoints, merged into two
 * draw calls, one solid and one dashed, with the same pixel-width lines as group outlines.
 * Rebuilt only when the routes, objects or spoiler policy change. While objects are dragged
 * (M3-T3), the segment ends at them are shifted in place, so the lines follow the drag.
 *
 * Each route is also published to the scene index as a curve, so a click near its line picks
 * it (rendering.md §10), and to the route index for its label and its waypoints' rings.
 */
export function RouteLines({
  routes,
  objects,
}: {
  routes: readonly ViewRoute[];
  objects: readonly ViewObject[];
}) {
  const policy: SpoilerPolicy = useSpoilerPolicy();
  const invalidate = useThree((state) => state.invalidate);
  const shapes = useMemo(() => routeShapes(routes, objects, policy), [routes, objects, policy]);
  const solid = useMemo(
    () =>
      lineObject(
        shapes.filter((shape) => !shape.dashed),
        false,
      ),
    [shapes],
  );
  const dashed = useMemo(
    () =>
      lineObject(
        shapes.filter((shape) => shape.dashed),
        true,
      ),
    [shapes],
  );

  useEffect(() => {
    publishRoutes(shapes);
    publishDrawn(RENDERER, shapes.map(drawnRoute));
    invalidate();
    return () => {
      publishRoutes([]);
      publishDrawn(RENDERER, null);
    };
  }, [shapes, invalidate]);

  // A move in progress drags the segment ends at the moving objects.
  useEffect(() => {
    const apply = () => {
      const preview = movePreview();
      for (const line of [solid, dashed]) {
        if (!line) continue;
        const { base, buffers } = line.userData as RouteLineData;
        shiftRouteEnds(
          base,
          buffers.positions,
          buffers.ends,
          preview?.ids ?? null,
          preview?.delta ?? [0, 0, 0],
        );
        const start = line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
        start.data.needsUpdate = true;
        if (line.material.dashed) writeLineDistances(line);
      }
      invalidate();
    };
    apply();
    return onMovePreview(apply);
  }, [solid, dashed, invalidate]);

  // What `new` made is freed when replaced or unmounted (AGENTS.md).
  useEffect(
    () => () => {
      for (const line of [solid, dashed]) {
        line?.geometry.dispose();
        line?.material.dispose();
      }
    },
    [solid, dashed],
  );

  // As for group outlines: the pixel widths need the drawing buffer's size, and dashes keep
  // about ROUTE_DASH_PX on screen near the camera's target. Setting uniforms allocates nothing.
  useFrame(({ camera, size, controls }) => {
    const perPx = worldPerPxAt1(camera, size.height);
    const target = (controls as { distance?: number } | null)?.distance;
    const distance = target ?? camera.position.length();
    const dashScale = 1 / Math.max(perPx * distance, 1e-6);
    for (const line of [solid, dashed]) {
      if (!line) continue;
      line.material.resolution.set(size.width, size.height);
      line.material.dashScale = dashScale;
    }
  });

  return (
    <>
      {solid && <primitive object={solid} />}
      {dashed && <primitive object={dashed} />}
    </>
  );
}

/** What a route line keeps for the move preview: the saved ends and the live buffers. */
interface RouteLineData {
  base: Float32Array;
  buffers: RouteBuffers;
}

function lineObject(shapes: readonly RouteShape[], dashed: boolean): LineSegments2 | null {
  const buffers = buildRouteBuffers(shapes);
  if (buffers.segmentCount === 0) return null;
  const geometry = new LineSegmentsGeometry();
  // `setPositions` keeps this very array, so the move preview can rewrite it in place.
  geometry.setPositions(buffers.positions);
  geometry.setColors(buffers.colors);
  geometry.setAttribute('instanceWidth', new InstancedBufferAttribute(buffers.widths, 1));
  const material = perSegmentWidthLineMaterial(dashed);
  if (dashed) {
    material.dashSize = ROUTE_DASH_PX;
    material.gapSize = ROUTE_GAP_PX;
  }
  const line = new LineSegments2(geometry, material);
  if (dashed) line.computeLineDistances();
  line.renderOrder = ROUTE_LINE_RENDER_ORDER;
  line.frustumCulled = false;
  const data: RouteLineData = { base: buffers.positions.slice(), buffers };
  line.userData = data;
  return line;
}

/**
 * Rewrites a dashed line's distances along it in place, as `computeLineDistances` does once:
 * each segment starts where the one before ended, so dashes run on across a route's corners.
 * Replacing the attribute instead would leave the old GPU buffer behind on every drag.
 */
function writeLineDistances(line: LineSegments2): void {
  const start = line.geometry.getAttribute('instanceDistanceStart') as
    InterleavedBufferAttribute | undefined;
  if (!start) return;
  const distances = start.data.array as Float32Array;
  const { positions, segmentCount } = (line.userData as RouteLineData).buffers;
  let along = 0;
  for (let segment = 0; segment < segmentCount; segment++) {
    const at = segment * 6;
    const length = Math.hypot(
      (positions[at + 3] ?? 0) - (positions[at] ?? 0),
      (positions[at + 4] ?? 0) - (positions[at + 1] ?? 0),
      (positions[at + 5] ?? 0) - (positions[at + 2] ?? 0),
    );
    distances[segment * 2] = along;
    along += length;
    distances[segment * 2 + 1] = along;
  }
  start.data.needsUpdate = true;
}

/**
 * A route in the scene index: picked within ROUTE_PICK_HALF_WIDTH_PX of its line at any zoom
 * (its pixel clamp is that, both ways). Its center and radius are its points' bounding box, so
 * a double-click frames the whole route.
 */
function drawnRoute(shape: RouteShape): DrawnObject {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of shape.points) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis] ?? 0, point[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? 0, point[axis] ?? 0);
    }
  }
  const [x0 = 0, y0 = 0, z0 = 0] = min;
  const [x1 = 0, y1 = 0, z1 = 0] = max;
  return {
    id: shape.id,
    renderer: RENDERER,
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    radius: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2,
    minRadiusPx: ROUTE_PICK_HALF_WIDTH_PX,
    maxRadiusPx: ROUTE_PICK_HALF_WIDTH_PX,
    state: shape.redacted ? 'redacted' : shape.draft ? 'draft' : 'normal',
    color: shape.color,
    pickPriority: ROUTE_PICK_PRIORITY,
    label: shape.label,
    labelPriority: 0,
    curve: shape.points,
    waypointIds: shape.waypointIds,
  };
}
