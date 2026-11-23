import type { ViewObject } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { InstancedBufferAttribute } from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { isClick } from '@/input/click.ts';
import { ignoresCameraKeys } from '@/input/use-keyboard.ts';
import { perSegmentWidthLineMaterial } from '@/render/groups/line-material.ts';
import { pickAt } from '@/render/picking/picking.ts';
import { buildRouteBuffers } from '@/render/routes/route-shapes.ts';
import { drawnObject } from '@/render/scene-index.ts';
import {
  ROUTE_DRAFT_COLOR,
  ROUTE_DRAFT_WIDTH_PX,
  ROUTE_LINE_RENDER_ORDER,
} from '@/render/tuning.ts';
import { useEditor } from '@/state/editor.ts';
import { useRouteDraft } from '@/state/route-draft.ts';
import { useSelection } from '@/state/selection.ts';
import { useCreateRoute } from './actions/use-create-route.ts';

/**
 * The Route tool (M4-T7, ux.md §5): while it's on, a click on an object adds it as the next
 * waypoint, Backspace removes the last one, Enter or the toolbar's Finish button creates the route
 * (two waypoints at least) and Esc leaves the tool. The waypoints so far are selected, so they're ringed and labelled, and a
 * white line joins them. Turning the tool off, or leaving edit mode, drops an unfinished route.
 */
export function RouteTool({ mapId, objects }: { mapId: string; objects: readonly ViewObject[] }) {
  const routing = useEditor((state) => state.routing);
  return routing ? <ActiveRouteTool mapId={mapId} objects={objects} /> : null;
}

function ActiveRouteTool({ mapId, objects }: { mapId: string; objects: readonly ViewObject[] }) {
  const get = useThree((state) => state.get);
  const createRoute = useCreateRoute(mapId, objects);
  const finish = useRef(createRoute);
  useEffect(() => {
    finish.current = createRoute;
  });

  useEffect(() => {
    const canvas = get().gl.domElement;
    const draft = useRouteDraft.getState();
    draft.clear();
    let press: { x: number; y: number } | null = null;
    // Each change of the waypoints selects them, for the rings and labels.
    const stopSync = useRouteDraft.subscribe((state) => {
      useSelection.getState().select(state.waypoints);
    });

    const onPointerDown = (event: PointerEvent) => {
      press = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      const started = press;
      press = null;
      if (event.button !== 0 || !started) return;
      if (!isClick(started, { x: event.clientX, y: event.clientY })) return;
      const hit = pickAt(get(), event.clientX, event.clientY);
      // Routes pass through objects, not through other routes.
      if (hit && !hit.waypointIds) useRouteDraft.getState().add(hit.id);
    };
    // In the capture phase, so these keys are the tool's: Backspace removes a waypoint rather
    // than deleting the selection, and Esc leaves the tool rather than clearing the selection.
    // Enter and the toolbar's Finish button both end here.
    const finishDraft = () => {
      const waypoints = [...useRouteDraft.getState().waypoints];
      if (waypoints.length < 2) return;
      useEditor.getState().stopRouting();
      void finish.current(waypoints);
    };
    useRouteDraft.setState({ finish: finishDraft });

    const onKeyDown = (event: KeyboardEvent) => {
      if (ignoresCameraKeys(event.target)) return;
      const state = useRouteDraft.getState();
      if (event.key === 'Backspace' || event.key === 'Delete') {
        state.removeLast();
      } else if (event.key === 'Enter') {
        if (state.waypoints.length < 2) return;
        finishDraft();
      } else if (event.key === 'Escape') {
        useEditor.getState().stopRouting();
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    canvas.style.cursor = 'crosshair';
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      canvas.style.cursor = '';
      stopSync();
      useRouteDraft.setState({ finish: null });
      useRouteDraft.getState().clear();
    };
  }, [get]);

  return <DraftLine />;
}

/** The line through the waypoints so far: one draw call, rebuilt on each click. */
function DraftLine() {
  const waypoints = useRouteDraft((state) => state.waypoints);
  const invalidate = useThree((state) => state.invalidate);
  const line = useMemo(() => {
    const points = waypoints.flatMap((id) => {
      const object = drawnObject(id);
      return object ? [object.center] : [];
    });
    if (points.length < 2) return null;
    const buffers = buildRouteBuffers([
      {
        id: 'draft',
        points,
        waypointIds: [...waypoints],
        color: ROUTE_DRAFT_COLOR,
        dashed: false,
        widthPx: ROUTE_DRAFT_WIDTH_PX,
        label: '',
        redacted: false,
        draft: true,
      },
    ]);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(buffers.positions);
    geometry.setColors(buffers.colors);
    geometry.setAttribute('instanceWidth', new InstancedBufferAttribute(buffers.widths, 1));
    const drawn = new LineSegments2(geometry, perSegmentWidthLineMaterial(false));
    // Over the routes already drawn.
    drawn.renderOrder = ROUTE_LINE_RENDER_ORDER + 0.1;
    drawn.frustumCulled = false;
    return drawn;
  }, [waypoints]);

  useEffect(() => {
    invalidate();
    return () => {
      line?.geometry.dispose();
      line?.material.dispose();
      invalidate();
    };
  }, [line, invalidate]);

  useFrame(({ size }) => {
    line?.material.resolution.set(size.width, size.height);
  });

  return line ? <primitive object={line} /> : null;
}
