import { addAfterEffect, useThree, type RootState } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { hoverStore } from '@/state/hover.ts';
import { effectiveLabelMode, useLabels } from '@/state/labels.ts';
import { useSelection } from '@/state/selection.ts';
import { clampedRadiusPx } from '../bodies/body-scale.ts';
import { drawnGroups } from '../groups/group-index.ts';
import type { GroupShape } from '../groups/group-shapes.ts';
import { drawnRoutes } from '../routes/route-index.ts';
import { routeLabelAnchor, type RouteShape } from '../routes/route-shapes.ts';
import { projected } from '../picking/picking.ts';
import { drawnObject, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import {
  GROUP_LABEL_HEIGHT_PX,
  LABEL_GAP_PX,
  LABEL_MAX,
  OBJECT_LABEL_HEIGHT_PX,
} from '../tuning.ts';
import { labelTimeline } from './label-stats.ts';
import { showLabels } from './label-pool.ts';
import { measureLabel } from './measure-text.ts';
import { solveLabels, type LabelCandidate, type PlacedLabel } from './solve-labels.ts';

const METRICS = {
  measure: measureLabel,
  heightPx: { object: OBJECT_LABEL_HEIGHT_PX, group: GROUP_LABEL_HEIGHT_PX },
  gapPx: LABEL_GAP_PX,
  max: LABEL_MAX,
};

let lastPlaced: readonly PlacedLabel[] = [];

/** The labels on screen after the last frame, for the test hooks. */
export function visibleLabels(): readonly PlacedLabel[] {
  return lastPlaced;
}

const scratch = new Vector3();

/** One object projected to the screen, for the few candidates of the hover mode. */
function projectOne(state: RootState, object: DrawnObject, perPx: number) {
  scratch.set(...object.center).project(state.camera);
  if (scratch.z < -1 || scratch.z > 1) return null;
  const x = ((scratch.x + 1) / 2) * state.size.width;
  const y = ((1 - scratch.y) / 2) * state.size.height;
  // Depth along the view direction, as the shaders compute it.
  scratch.set(...object.center).applyMatrix4(state.camera.matrixWorldInverse);
  const radiusPx = clampedRadiusPx(
    object.radius,
    -scratch.z,
    perPx,
    object.minRadiusPx,
    object.maxRadiusPx,
  );
  return { x, y, radiusPx };
}

/**
 * Candidate objects, reused frame after frame: in the "all" mode there are thousands per frame,
 * and allocating them anew would churn the garbage collector while the camera moves
 * (rendering.md §2, rule 4).
 */
const candidates: LabelCandidate[] = [];
let candidateCount = 0;

/** The next pooled candidate slot, grown on demand; the caller sets every field. */
function nextSlot(): LabelCandidate {
  let slot = candidates[candidateCount];
  if (!slot) {
    slot = {
      id: '',
      text: '',
      kind: 'object',
      x: 0,
      y: 0,
      radiusPx: 0,
      selected: false,
      hovered: false,
      labelPriority: 0,
      groupSize: 0,
    };
    candidates.push(slot);
  }
  candidateCount++;
  return slot;
}

function addCandidate(
  object: DrawnObject,
  x: number,
  y: number,
  radiusPx: number,
  selected: ReadonlySet<string>,
  hoveredId: string | null,
): void {
  // A route's label sits on its line instead (addRouteCandidate).
  if (object.waypointIds) return;
  const slot = nextSlot();
  slot.id = object.id;
  slot.text = object.label;
  slot.kind = 'object';
  slot.x = x;
  slot.y = y;
  slot.radiusPx = radiusPx;
  slot.selected = selected.has(object.id);
  slot.hovered = object.id === hoveredId;
  slot.labelPriority = object.labelPriority;
  slot.groupSize = 0;
  delete slot.color;
}

/** A group's label, centred on its outline's centroid, if that's in front of the camera. */
function addGroupCandidate(state: RootState, group: GroupShape, selected: ReadonlySet<string>) {
  scratch.set(...group.centroid).project(state.camera);
  if (scratch.z < -1 || scratch.z > 1) return;
  const slot = nextSlot();
  slot.id = group.id;
  slot.text = group.label;
  slot.kind = 'group';
  slot.x = ((scratch.x + 1) / 2) * state.size.width;
  slot.y = ((1 - scratch.y) / 2) * state.size.height;
  slot.radiusPx = 0;
  slot.selected = selected.has(group.id);
  slot.hovered = false;
  slot.labelPriority = 0;
  slot.groupSize = group.memberCount;
  slot.color = group.color;
}

/**
 * A route's label (M4-T7), centred on the middle of its middle segment. It looks and acts like
 * a group label (centred, in the line's color, a click selects it), so it takes that kind. The
 * points come from the scene index, which shifts them while a waypoint is dragged.
 */
function addRouteCandidate(
  state: RootState,
  route: RouteShape,
  selected: ReadonlySet<string>,
  hoveredId: string | null,
) {
  const anchor = routeLabelAnchor(drawnObject(route.id)?.curve ?? route.points);
  if (!anchor) return;
  scratch.set(...anchor).project(state.camera);
  if (scratch.z < -1 || scratch.z > 1) return;
  const slot = nextSlot();
  slot.id = route.id;
  slot.text = route.label;
  slot.kind = 'group';
  slot.x = ((scratch.x + 1) / 2) * state.size.width;
  slot.y = ((1 - scratch.y) / 2) * state.size.height;
  slot.radiusPx = 0;
  slot.selected = selected.has(route.id);
  slot.hovered = route.id === hoveredId;
  slot.labelPriority = 0;
  slot.groupSize = route.points.length;
  slot.color = route.color;
}

/** Chooses and places this frame's labels (rendering.md §11). Runs after each rendered frame. */
function updateLabels(state: RootState): void {
  const started = performance.now();
  const mode = effectiveLabelMode(useLabels.getState());
  const hoveredId = hoverStore.getState().hoveredId;
  const selected = new Set(useSelection.getState().selectedIds);
  candidateCount = 0;

  if (mode === 'all') {
    // Every visible object: the picker has already projected them all for this camera.
    projected(state).visit((object, x, y, radiusPx) => {
      addCandidate(object, x, y, radiusPx, selected, hoveredId);
    });
  } else {
    // Hover and selection only.
    const perPx = worldPerPxAt1(state.camera, state.size.height);
    const ids = hoveredId === null ? selected : new Set([...selected, hoveredId]);
    for (const id of ids) {
      const object = drawnObject(id);
      const at = object ? projectOne(state, object, perPx) : null;
      if (object && at) addCandidate(object, at.x, at.y, at.radiusPx, selected, hoveredId);
    }
  }

  // Group names: all of them in the 'groups' and 'all' modes, else only a selected group's.
  const allGroups = mode === 'groups' || mode === 'all';
  for (const group of drawnGroups()) {
    if (allGroups || selected.has(group.id)) addGroupCandidate(state, group, selected);
  }
  // Route names: like group names, or when hovered.
  for (const route of drawnRoutes()) {
    if (allGroups || selected.has(route.id) || route.id === hoveredId) {
      addRouteCandidate(state, route, selected, hoveredId);
    }
  }

  lastPlaced = solveLabels(
    candidates,
    { widthPx: state.size.width, heightPx: state.size.height },
    METRICS,
    // Only this frame's candidates: the array is reused and may hold older ones past this.
    candidateCount,
  );
  showLabels(lastPlaced);
  labelTimeline.record(performance.now() - started);
}

/**
 * Keeps the label layer in step with the canvas: after every rendered frame (the camera has
 * moved, or the data changed), and after a mode, hover or selection change, which asks for one
 * frame. Lives inside `<Canvas>`.
 */
export function LabelDriver() {
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const stopAfter = addAfterEffect(() => {
      updateLabels(get());
    });
    const stopLabels = useLabels.subscribe(() => {
      invalidate();
    });
    const stopHover = hoverStore.subscribe(() => {
      invalidate();
    });
    const stopSelection = useSelection.subscribe(() => {
      invalidate();
    });
    return () => {
      stopAfter();
      stopLabels();
      stopHover();
      stopSelection();
      showLabels([]);
    };
  }, [get, invalidate]);
  return null;
}
