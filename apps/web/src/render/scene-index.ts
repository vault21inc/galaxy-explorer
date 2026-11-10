/**
 * What the current view has drawn, by entity id, on the CPU (rendering.md §10, §14): each
 * object's world center, its world radius and the on-screen clamp its renderer applies. The
 * screen-space picker (render/picking/), the selection rings and the test hooks read it.
 *
 * Renderers publish their whole list whenever they rebuild their buffers, which happens only
 * when the payload or the spoiler policy changes, never per frame.
 */

export type DrawnState = 'normal' | 'redacted' | 'draft';

export interface DrawnObject {
  id: string;
  /** Which renderer drew it, such as 'instanced-bodies'. */
  renderer: string;
  center: readonly [number, number, number];
  /** In the view's unit (light-years in the galaxy view). */
  radius: number;
  /** The on-screen radius clamp, in CSS pixels. */
  minRadiusPx: number;
  maxRadiusPx: number;
  state: DrawnState;
  /** The color it's drawn in, as `#rrggbb`. */
  color: string;
  /**
   * When pick circles overlap, the higher priority wins: a system inside a nebula is picked
   * before the nebula. Bodies are 1, regions (areas) 0.
   */
  pickPriority: number;
  /** Its label's text under the current spoiler policy (labels/label-text.ts). */
  label: string;
  /** 0–10: higher keeps its label when labels collide (ux.md §7). */
  labelPriority: number;
  /**
   * It opens a view of its own (a system or planet marked explorable): zooming in far enough,
   * double-clicking or pressing Enter enters it (M5-T2). Absent means no.
   */
  opensView?: boolean;
  /** A region's shape (M4-T6): sphere, disc, storm or rift. */
  shape?: string;
  /**
   * A rift's center line in world coordinates (M4-T6). It is picked by its distance from this
   * curve, within `radius` (its half-width), instead of as a circle (rendering.md §10).
   */
  curve?: readonly (readonly [number, number, number])[];
  /**
   * A route (M4-T7): the object at each point of `curve`. Routes are picked along their line
   * like rifts, but they aren't objects: no ring, no box selection, and their label sits on the
   * line (label-driver.tsx). A move in progress shifts the points at moving objects.
   */
  waypointIds?: readonly string[];
}

const sources = new Map<string, readonly DrawnObject[]>();
let byId: Map<string, DrawnObject> | null = null;
let version = 0;
const listeners = new Set<() => void>();

/**
 * A move in progress (M3-T3): these objects are shown shifted by `delta` until the drag is
 * saved or cancelled. The cached payload stays as it was; the renderers, rings, labels and the
 * picker apply the shift on the fly, so a drag re-renders nothing in React.
 */
export interface MovePreview {
  ids: ReadonlySet<string>;
  delta: readonly [number, number, number];
}
let preview: MovePreview | null = null;
const previewListeners = new Set<() => void>();

export function movePreview(): MovePreview | null {
  return preview;
}

/** Shows (or, with null, ends) a move preview, and tells every listener. */
export function setMovePreview(next: MovePreview | null): void {
  preview = next;
  version++;
  for (const listener of previewListeners) listener();
  for (const listener of listeners) listener();
}

/** Calls `listener` whenever the move preview changes; returns the unsubscribe function. */
export function onMovePreview(listener: () => void): () => void {
  previewListeners.add(listener);
  return () => {
    previewListeners.delete(listener);
  };
}

/** An object as it's shown: shifted while it's part of a move preview. */
function shown(object: DrawnObject): DrawnObject {
  if (!preview) return object;
  const [dx, dy, dz] = preview.delta;
  if (object.waypointIds && object.curve) {
    const { ids } = preview;
    const waypoints = object.waypointIds;
    if (!waypoints.some((id) => ids.has(id))) return object;
    const curve = object.curve.map(([x, y, z], index) =>
      ids.has(waypoints[index] ?? '') ? ([x + dx, y + dy, z + dz] as const) : ([x, y, z] as const),
    );
    return { ...object, curve };
  }
  if (!preview.ids.has(object.id)) return object;
  const [x, y, z] = object.center;
  return { ...object, center: [x + dx, y + dy, z + dz] };
}

/** Increases whenever any renderer publishes, so the picker knows to rebuild. */
export function drawnVersion(): number {
  return version;
}

/** Calls `listener` after every publish; returns the unsubscribe function. */
export function onDrawnChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replaces one renderer's objects; null removes them (the renderer unmounted). */
export function publishDrawn(renderer: string, objects: readonly DrawnObject[] | null): void {
  if (objects) sources.set(renderer, objects);
  else sources.delete(renderer);
  byId = null;
  version++;
  for (const listener of listeners) listener();
}

/** An object where it's drawn now, including any move in progress. */
export function drawnObject(id: string): DrawnObject | undefined {
  const object = savedObject(id);
  return object ? shown(object) : undefined;
}

/** An object where it was published: its saved position, ignoring a move in progress. */
export function savedObject(id: string): DrawnObject | undefined {
  if (!byId) {
    byId = new Map();
    for (const objects of sources.values()) {
      for (const object of objects) byId.set(object.id, object);
    }
  }
  return byId.get(id);
}

export function drawnObjects(): DrawnObject[] {
  const all = [...sources.values()].flat();
  return preview ? all.map(shown) : all;
}
