/**
 * What the current view has drawn, by entity id, on the CPU (rendering.md §10, §14): each
 * object's world center, its world radius and the on-screen clamp its renderer applies. The test
 * hooks read it now; the screen-space picker (M2-T5) will too.
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
}

const sources = new Map<string, readonly DrawnObject[]>();
let byId: Map<string, DrawnObject> | null = null;

/** Replaces one renderer's objects; null removes them (the renderer unmounted). */
export function publishDrawn(renderer: string, objects: readonly DrawnObject[] | null): void {
  if (objects) sources.set(renderer, objects);
  else sources.delete(renderer);
  byId = null;
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
