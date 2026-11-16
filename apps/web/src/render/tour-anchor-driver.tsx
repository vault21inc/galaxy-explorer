import { addAfterEffect, useThree, type RootState } from '@react-three/fiber';
import { useEffect } from 'react';
import { Matrix4, Vector3 } from 'three';
import { useTourSignals } from '@/help/tour-signals.ts';
import { useTour } from '@/help/tour-store.ts';
import { TOURS } from '@/help/tours.ts';
import type { ObjectPick } from '@/help/tour-types.ts';
import { useSelection } from '@/state/selection.ts';
import { drawnObject, drawnObjects, type DrawnObject } from './scene-index.ts';

/**
 * The guided tours' eyes on the canvas (M8-T10, ux.md §12). After each frame the canvas renders
 * anyway, and when the step changes, it finds the object a step points at and where it is on
 * the page, and notices the camera moving. It never asks for a frame, so a tour step that waits
 * keeps the canvas idle (rendering.md §2); the highlight follows the object because the camera
 * only moves by rendering frames.
 */
export function TourAnchorDriver() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const update = () => {
      track(get());
    };
    const stops = [
      addAfterEffect(update),
      useTour.subscribe(update),
      useSelection.subscribe(update),
    ];
    return () => {
      for (const stop of stops) stop();
      useTourSignals.setState({ anchor: null });
    };
  }, [get]);
  return null;
}

// Reused between frames: nothing is allocated while the camera moves (rendering.md §2).
const lastCamera = new Matrix4();
const point = new Vector3();
let chosenId: string | null = null;

function track(state: RootState): void {
  const active = useTour.getState().active;
  if (!active) {
    if (useTourSignals.getState().anchor) useTourSignals.setState({ anchor: null });
    chosenId = null;
    return;
  }
  // The camera's world matrix is where it is and where it looks: any change is a move.
  if (!lastCamera.equals(state.camera.matrixWorld)) {
    lastCamera.copy(state.camera.matrixWorld);
    useTourSignals.setState((signals) => ({ cameraMoves: signals.cameraMoves + 1 }));
  }
  const target = TOURS[active.tour].steps[active.index]?.target;
  const anchor = target?.kind === 'object' ? locate(state, target.pick) : null;
  const before = useTourSignals.getState().anchor;
  const moved =
    anchor?.id !== before?.id ||
    (anchor &&
      before &&
      (Math.abs(anchor.x - before.x) > 0.5 || Math.abs(anchor.y - before.y) > 0.5));
  if (moved) useTourSignals.setState({ anchor });
}

/** The object to point at, on the page, keeping the one chosen while it stays on screen. */
function locate(state: RootState, pick: ObjectPick): { id: string; x: number; y: number } | null {
  if (pick === 'selected') {
    for (const id of useSelection.getState().selectedIds) {
      const object = drawnObject(id);
      const at = object ? onPage(state, object) : null;
      if (object && at) return { id: object.id, ...at };
    }
    return null;
  }
  const kept = chosenId ? drawnObject(chosenId) : undefined;
  const keptAt = kept && fits(kept, pick) ? onPage(state, kept, 0.85) : null;
  if (kept && keptAt) return { id: kept.id, ...keptAt };

  // Otherwise the one nearest the middle of the view, well inside its edges.
  const rect = state.gl.domElement.getBoundingClientRect();
  const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  let best: { id: string; x: number; y: number; distance: number } | null = null;
  for (const object of drawnObjects()) {
    if (!fits(object, pick)) continue;
    const at = onPage(state, object, 0.85);
    if (!at) continue;
    const distance = Math.hypot(at.x - middle.x, at.y - middle.y);
    if (!best || distance < best.distance) best = { id: object.id, ...at, distance };
  }
  chosenId = best?.id ?? null;
  return best ? { id: best.id, x: best.x, y: best.y } : null;
}

/**
 * A body worth pointing at: drawn as itself (not a draft or a hidden spoiler), and a star,
 * system, planet or station, not a region, a route, a belt, a pin or an event marker.
 */
function fits(object: DrawnObject, pick: ObjectPick): boolean {
  if (object.state !== 'normal' || object.pickPriority < 1) return false;
  if (object.curve || object.waypointIds || object.onSphere || object.offsetPx) return false;
  return pick !== 'explorable' || object.opensView === true;
}

/**
 * Where an object's center is on the page, in CSS pixels, or null outside the middle `inner`
 * share of the canvas (1: anywhere on it) or behind the camera. `project()` maps a world point
 * to normalized device coordinates: -1 to 1 across the canvas, and z from -1 (near) to 1 (far).
 */
function onPage(state: RootState, object: DrawnObject, inner = 1): { x: number; y: number } | null {
  point.set(object.center[0], object.center[1], object.center[2]).project(state.camera);
  if (Math.abs(point.x) > inner || Math.abs(point.y) > inner || Math.abs(point.z) > 1) return null;
  const rect = state.gl.domElement.getBoundingClientRect();
  return {
    x: rect.left + ((point.x + 1) / 2) * rect.width,
    // Device coordinates point up; the page's point down.
    y: rect.top + ((1 - point.y) / 2) * rect.height,
  };
}
