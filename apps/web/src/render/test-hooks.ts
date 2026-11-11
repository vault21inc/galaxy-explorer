import { CameraControlsImpl } from '@react-three/drei';
import { Vector3 } from 'three';
import { gizmoAnchor, gizmoAxis } from '@/editor/gizmo-state.ts';
import { GIZMO_SIZE } from '@/editor/move-tool.tsx';
import { placementGhost } from '@/editor/placement.tsx';
import { toNdc, workPlanePoint } from '@/editor/work-plane.ts';
import { detectPlatform, type Platform } from '@/input/platform.ts';
import { hoverStore } from '@/state/hover.ts';
import { useSelection } from '@/state/selection.ts';
import { useNavigation } from '@/state/navigation.ts';
import { viewNavigation } from '@/state/view-navigator.ts';
import { orbitRingOf } from './orbits/orbit-rings.tsx';
import { currentLights } from './stars/system-lights.ts';
import { transitionsStarted, viewSettled } from './transition/transition-controller.ts';
import { flyTo } from './camera/fly-to.ts';
import { galaxyDiscState } from './galaxy/galaxy-disc.tsx';
import { drawnGroup } from './groups/group-index.ts';
import { underlayState } from './galaxy/underlay.tsx';
import { visibleLabels } from './labels/label-driver.tsx';
import { labelTimeline } from './labels/label-stats.ts';
import { clampedRadiusPx } from './bodies/body-scale.ts';
import { canvasState, frameTimeline, renderInfo, type RenderInfo } from './diagnostics.ts';
import type { FrameStats } from './frame-timeline.ts';
import { ringedIds } from './picking/selection-rings.tsx';
import { stormTextureOf } from './regions/storm-discs.tsx';
import { drawnRoute } from './routes/route-index.ts';
import { drawnObject, type DrawnObject } from './scene-index.ts';
import { worldPerPxAt1 } from './screen-scale.ts';

/**
 * `window.__GE_TEST__`: lets end-to-end tests and `pnpm perf` read 3D state instead of guessing
 * from pixels (rendering.md §14).
 *
 * This module is loaded only when DIAGNOSTICS_ENABLED is true (see stage.tsx).
 */
export interface GeTestHooks {
  /** Frames rendered since the page loaded. */
  readonly frameCount: number;
  renderInfo(): RenderInfo | undefined;
  /**
   * Frame-time statistics since the last `resetFrameStats()`, or since `sinceMs` (a
   * `performance.now()` time) when given.
   */
  frameStats(sinceMs?: number): FrameStats;
  resetFrameStats(): void;
  /** Where the camera is and what it looks at, in scene units. */
  cameraPose(): { position: [number, number, number]; target: [number, number, number] } | null;
  /**
   * Where an object's center is on the page, in CSS pixels (for real mouse events), or null if
   * it isn't drawn or is off screen or behind the camera.
   */
  screenPositionOf(id: string): { x: number; y: number } | null;
  /** The object's on-screen radius in CSS pixels, with its renderer's clamp applied. */
  screenRadiusOf(id: string): number | null;
  /** How an object is drawn: its renderer, state (normal, redacted, draft) and color. */
  drawnObject(id: string): DrawnObject | null;
  /**
   * How a group's outline is drawn (M4-T3), or null when it has none: its point count, the
   * centroid where its label goes, its look, its label text and how many members it encloses.
   */
  groupOutline(id: string): {
    pointCount: number;
    centroid: [number, number, number];
    color: string;
    dashed: boolean;
    widthPx: number;
    label: string;
    memberCount: number;
    redacted: boolean;
  } | null;
  /**
   * How a route is drawn (M4-T7), or null when it isn't: its waypoints in order, where its line
   * runs now (shifted while a waypoint is dragged), its look and its label.
   */
  routeLine(id: string): {
    waypointIds: string[];
    points: [number, number, number][];
    color: string;
    dashed: boolean;
    widthPx: number;
    label: string;
    redacted: boolean;
  } | null;
  /** The keyboard convention the app detected: Cmd is primary on 'mac', Ctrl elsewhere. */
  platform(): Platform;
  /** The selection, in order. */
  selectedIds(): string[];
  /** The objects with a ring now: selected, hovered, or members of a selected group (M4-T4). */
  ringedIds(): string[];
  /** Where a world point is on the page, in CSS pixels, or null behind the camera (M4-T6). */
  projectPoint(point: [number, number, number]): { x: number; y: number } | null;
  /** Which texture a storm draws: its generated one or its uploaded picture (M4-T6). */
  stormTexture(id: string): 'generated' | 'upload' | null;
  /** The object under the pointer, or null. */
  hoveredId(): string | null;
  /**
   * The view on top: its level and subject (null for the galaxy view, whose subject is the map),
   * or null when no view is open (M5-T1).
   */
  level(): { level: 'galaxy' | 'system' | 'orbit'; subjectId: string | null } | null;
  /** Opens an object's view, as zooming in does; resolves once the transition has finished. */
  enter(id: string): Promise<void>;
  /** Goes up one view, as Esc does; resolves once the transition has finished. */
  exit(): Promise<void>;
  /** Whether a change of view is under way or the address is still being resolved. */
  transitioning(): boolean;
  /** Animated changes of view started since the page loaded (M5-T2). */
  transitions(): number;
  /**
   * The stars lighting the system view's bodies (M5-T3, D-29), largest first, at most 3: their
   * positions and linear colors. Empty when no star lights it.
   */
  systemLights(): { position: [number, number, number]; color: [number, number, number] }[];
  /**
   * A body's orbit ring as drawn (M5-T4): its center (the system's, or its star's, D-29) and
   * radius, following a drag; null when it has none.
   */
  orbitRing(id: string): { center: [number, number, number]; radius: number } | null;
  /** Flies the camera to an object, as a double-click does; resolves when it has settled. */
  flyTo(id: string): Promise<void>;
  /** Where a page point meets the work plane (y = 0), as placing an object computes it. */
  workPlanePointAt(clientX: number, clientY: number): [number, number, number] | null;
  /** The placement ghost: its type and position, or null when nothing is being placed. */
  placement(): { baseType: string; position: [number, number, number] } | null;
  /**
   * Where to press on the height gizmo's vertical arrow, in page pixels, or null without a
   * gizmo. Mirrors three-stdlib's TransformControls: its handles are scaled by
   * `distance × min(1.9 × tan(fov / 2), 7) × size / 7`, and the Y arrow's pick area runs from
   * 0.1 to 1.1 of that above the anchor.
   */
  gizmoHandleAt(): { x: number; y: number } | null;
  /** The gizmo axis under the pointer ("Y"), or null. */
  gizmoAxis(): string | null;
  /**
   * The galaxy disc on screen: its bake key (everything that shapes its pixels) and whether
   * it's the live preview of unsaved settings (M3-T8). Null outside the galaxy view.
   */
  galaxyDisc(): { key: string; preview: boolean } | null;
  /** The reference underlay as drawn (edit mode only), or null when it isn't (M3-T8). */
  underlay(): {
    assetId: string;
    widthLy: number;
    rotationDeg: number;
    offsetX: number;
    offsetZ: number;
    opacity: number;
  } | null;
  /** The labels on screen after the last frame. */
  visibleLabels(): { id: string; text: string }[];
  /** Label-update durations since the last reset (budget: 2 ms per frame, rendering.md §11). */
  labelStats(): { count: number; medianMs: number; p95Ms: number };
  resetLabelStats(): void;
}

declare global {
  interface Window {
    __GE_TEST__?: GeTestHooks;
  }
}

export function installTestHooks(): void {
  window.__GE_TEST__ = {
    get frameCount() {
      return frameTimeline.frameCount;
    },
    renderInfo,
    frameStats: (sinceMs?: number) =>
      sinceMs === undefined ? frameTimeline.stats() : frameTimeline.stats(sinceMs),
    resetFrameStats: () => {
      frameTimeline.reset(performance.now());
    },
    cameraPose,
    screenPositionOf,
    screenRadiusOf,
    drawnObject: (id) => drawnObject(id) ?? null,
    groupOutline: (id) => {
      const shape = drawnGroup(id);
      if (!shape) return null;
      const { points, centroid, color, dashed, widthPx, label, memberCount, redacted } = shape;
      return {
        pointCount: points.length,
        centroid,
        color,
        dashed,
        widthPx,
        label,
        memberCount,
        redacted,
      };
    },
    routeLine: (id) => {
      const shape = drawnRoute(id);
      if (!shape) return null;
      const { waypointIds, color, dashed, widthPx, label, redacted } = shape;
      const points = (drawnObject(id)?.curve ?? shape.points).map(
        ([x, y, z]): [number, number, number] => [x, y, z],
      );
      return { waypointIds: [...waypointIds], points, color, dashed, widthPx, label, redacted };
    },
    platform: () => detectPlatform(),
    selectedIds: () => [...useSelection.getState().selectedIds],
    ringedIds: () => [...ringedIds()],
    projectPoint: (point) => pageProjection(point),
    stormTexture: (id) => stormTextureOf(id),
    hoveredId: () => hoverStore.getState().hoveredId,
    workPlanePointAt: (clientX, clientY) => {
      const state = canvasState();
      if (!state) return null;
      return workPlanePoint(state.camera, toNdc(clientX, clientY, state.gl.domElement));
    },
    placement: () => placementGhost(),
    gizmoHandleAt,
    gizmoAxis: () => gizmoAxis(),
    galaxyDisc: () => galaxyDiscState(),
    underlay: () => {
      const state = underlayState();
      if (!state) return null;
      const { assetId, widthLy, rotationDeg, offsetX, offsetZ, opacity } = state;
      return { assetId, widthLy, rotationDeg, offsetX, offsetZ, opacity };
    },
    visibleLabels: () => visibleLabels().map(({ id, text }) => ({ id, text })),
    labelStats: () => labelTimeline.stats(),
    resetLabelStats: () => {
      labelTimeline.reset();
    },
    level: () => {
      const top = useNavigation.getState().stack.at(-1);
      if (!top) return null;
      return { level: top.level, subjectId: top.level === 'galaxy' ? null : top.subjectId };
    },
    enter: async (id) => {
      viewNavigation.enter(id);
      await settled();
    },
    exit: async () => {
      viewNavigation.exit();
      await settled();
    },
    transitioning: () => !viewSettled(),
    transitions: () => transitionsStarted(),
    orbitRing: (id) => {
      const ring = orbitRingOf(id);
      return ring ? { center: [...ring.center], radius: ring.radius } : null;
    },
    systemLights: () =>
      currentLights().map(({ position: [x, y, z], color: [r, g, b] }) => ({
        position: [x, y, z],
        color: [r, g, b],
      })),
    flyTo: async (id) => {
      const object = drawnObject(id);
      const controls = canvasState()?.controls;
      if (object && controls instanceof CameraControlsImpl) await flyTo(controls, [object]);
    },
  };
}

/** Resolves once the new address has been resolved and the change of view has run. */
async function settled(): Promise<void> {
  // Timers, not animation frames: those pause in a background tab.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  const deadline = performance.now() + 10_000;
  while (!viewSettled() && performance.now() < deadline) await tick();
}

// Scratch vectors: the hooks may be called in tight loops by tests.
const scratch = new Vector3();

function screenPositionOf(id: string): { x: number; y: number } | null {
  const object = drawnObject(id);
  return object ? pageProjection(object.center) : null;
}

/** A world point on the page, in CSS pixels, or null when it's off screen or behind the camera. */
function pageProjection(point: readonly [number, number, number]): { x: number; y: number } | null {
  const state = canvasState();
  if (!state) return null;
  // project() maps a world point to normalized device coordinates: -1 to 1 across the canvas,
  // and z from -1 (near plane) to 1 (far plane). Outside those ranges it isn't visible.
  scratch.set(...point).project(state.camera);
  if (Math.abs(scratch.x) > 1 || Math.abs(scratch.y) > 1 || Math.abs(scratch.z) > 1) return null;
  const rect = state.gl.domElement.getBoundingClientRect();
  return {
    x: rect.left + ((scratch.x + 1) / 2) * rect.width,
    // Device coordinates point up; page coordinates point down.
    y: rect.top + ((1 - scratch.y) / 2) * rect.height,
  };
}

function screenRadiusOf(id: string): number | null {
  const state = canvasState();
  const object = drawnObject(id);
  if (!state || !object) return null;
  // Depth: the distance in front of the camera, as the shaders compute it (view-space -z).
  scratch.set(...object.center).applyMatrix4(state.camera.matrixWorldInverse);
  return clampedRadiusPx(
    object.radius,
    -scratch.z,
    worldPerPxAt1(state.camera, state.size.height),
    object.minRadiusPx,
    object.maxRadiusPx,
  );
}

function cameraPose() {
  const state = canvasState();
  if (!state) return null;
  const target = new Vector3();
  // `<CameraControls makeDefault>` registers itself as the canvas's default controls.
  if (state.controls instanceof CameraControlsImpl) {
    state.controls.getTarget(target);
  }
  const { x, y, z } = state.camera.position;
  return { position: [x, y, z] as [number, number, number], target: target.toArray() };
}

function gizmoHandleAt(): { x: number; y: number } | null {
  const state = canvasState();
  const anchor = gizmoAnchor();
  if (!state || !anchor) return null;
  const camera = state.camera as typeof state.camera & { fov?: number };
  const distance = anchor.position.distanceTo(camera.position);
  const factor =
    distance * Math.min((1.9 * Math.tan((Math.PI * (camera.fov ?? 45)) / 360)) / camera.zoom, 7);
  scratch.copy(anchor.position);
  scratch.y += 0.6 * ((factor * GIZMO_SIZE) / 7);
  scratch.project(state.camera);
  const rect = state.gl.domElement.getBoundingClientRect();
  return {
    x: rect.left + ((scratch.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - scratch.y) / 2) * rect.height,
  };
}
