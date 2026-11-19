import type { RootState } from '@react-three/fiber';
import { Matrix4 } from 'three';
import { drawnObject, drawnObjects, drawnVersion, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { labelHitAt } from './label-hits.ts';
import { ScreenPicker } from './screen-picker.ts';
import {
  LABEL_HIT_PADDING_TOUCH_PX,
  LABEL_OVER_AREA_PX,
  PICK_MIN_RADIUS_TOUCH_PX,
} from '../tuning.ts';

/**
 * The app's picker, rebuilt only when needed (rendering.md §10): when the camera has moved,
 * the canvas changed size, or a renderer published new objects since the last pick. While the
 * camera is still, pointer moves reuse the last projection; each costs one grid lookup.
 */
const picker = new ScreenPicker();
const viewProjection = new Matrix4();
const lastMatrix = new Float32Array(16);
let lastVersion = -1;
let lastWidth = -1;
let lastHeight = -1;

function ensureFresh(state: RootState): void {
  const { camera, size } = state;
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const matrix = viewProjection.elements;
  const moved = matrix.some((value, index) => value !== lastMatrix[index]);
  if (
    !moved &&
    drawnVersion() === lastVersion &&
    size.width === lastWidth &&
    size.height === lastHeight
  ) {
    return;
  }
  const { x, y, z } = camera.position;
  picker.rebuild(drawnObjects(), matrix, {
    widthPx: size.width,
    heightPx: size.height,
    worldPerPxAt1: worldPerPxAt1(camera, size.height),
    cameraPosition: [x, y, z],
  });
  lastMatrix.set(matrix);
  lastVersion = drawnVersion();
  lastWidth = size.width;
  lastHeight = size.height;
}

/** The picker, fresh for the current camera: every drawn object projected to the screen. */
export function projected(state: RootState): ScreenPicker {
  ensureFresh(state);
  return picker;
}

/**
 * The object under a point given in page coordinates (`clientX`, `clientY`), or null.
 *
 * A body the pointer is on wins, so a dot under a neighbour's label can still be clicked;
 * but over a wide target (a belt's band, a rift, a route, a body larger on screen than
 * LABEL_OVER_AREA_PX) an object's label, drawn on top, wins (label-hits.ts).
 */
export function pickAt(
  state: RootState,
  clientX: number,
  clientY: number,
  /**
   * `labels: false`: bodies only, as zooming wants (zoom-gate.ts). `touch`: a finger's tap,
   * which reaches further than a pointer (PICK_MIN_RADIUS_TOUCH_PX, LABEL_HIT_PADDING_TOUCH_PX).
   */
  { labels = true, touch = false }: { labels?: boolean; touch?: boolean } = {},
): DrawnObject | null {
  ensureFresh(state);
  const rect = state.gl.domElement.getBoundingClientRect();
  const xPx = clientX - rect.left;
  const yPx = clientY - rect.top;
  const body = picker.pick(xPx, yPx, touch ? PICK_MIN_RADIUS_TOUCH_PX : 0);
  if (!labels) return body;
  if (body && picker.lastHitRadiusPx <= LABEL_OVER_AREA_PX) return body;
  const labelled = labelHitAt(xPx, yPx, touch ? LABEL_HIT_PADDING_TOUCH_PX : undefined);
  const viaLabel = labelled === null ? undefined : drawnObject(labelled);
  return viaLabel ?? body;
}
