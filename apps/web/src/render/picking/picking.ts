import type { RootState } from '@react-three/fiber';
import { Matrix4 } from 'three';
import { drawnObjects, drawnVersion, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { ScreenPicker } from './screen-picker.ts';

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
  picker.rebuild(drawnObjects(), matrix, {
    widthPx: size.width,
    heightPx: size.height,
    worldPerPxAt1: worldPerPxAt1(camera, size.height),
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

/** The object under a point given in page coordinates (`clientX`, `clientY`), or null. */
export function pickAt(state: RootState, clientX: number, clientY: number): DrawnObject | null {
  ensureFresh(state);
  const rect = state.gl.domElement.getBoundingClientRect();
  return picker.pick(clientX - rect.left, clientY - rect.top);
}
