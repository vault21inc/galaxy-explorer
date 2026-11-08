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
}

const sources = new Map<string, readonly DrawnObject[]>();
let byId: Map<string, DrawnObject> | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** Increases whenever any renderer publishes, so the picker knows to rebuild. */
export function drawnVersion(): number {
  return version;
}

/** Calls `listener` after every publish; returns the unsubscribe function. */
export function onDrawnChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replaces one renderer's objects; null removes them (the renderer unmounted). */
export function publishDrawn(renderer: string, objects: readonly DrawnObject[] | null): void {
  if (objects) sources.set(renderer, objects);
  else sources.delete(renderer);
  byId = null;
  version++;
  for (const listener of listeners) listener();
}

export function drawnObject(id: string): DrawnObject | undefined {
  if (!byId) {
    byId = new Map();
    for (const objects of sources.values())
      for (const object of objects) byId.set(object.id, object);
  }
  return byId.get(id);
}

export function drawnObjects(): DrawnObject[] {
  return [...sources.values()].flat();
}
