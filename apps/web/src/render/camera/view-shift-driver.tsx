import { CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, type Camera } from 'three';
import { matches } from '@/lib/layout-tier.ts';
import { capturing, useCapture } from '@/state/capture.ts';
import { viewInsetsStore } from '@/state/view-insets.ts';
import { VIEW_SHIFT_MS } from '../tuning.ts';
import { shiftFor } from './view-shift.ts';

/** The shift's progress, kept between frames: nothing is allocated while it eases. */
interface Ease {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** What's applied to the camera now. */
  x: number;
  y: number;
  startMs: number;
  moving: boolean;
}

/**
 * Slides the picture so its center is the middle of what the details panel leaves uncovered
 * (rendering.md §12, "The view shift"; D-58). On a phone, opening an object's details covers
 * half the screen: without this, the object sits half under the sheet.
 *
 * How: a lens shift. `PerspectiveCamera.setViewOffset(fullWidth, fullHeight, x, y, width,
 * height)` makes the camera render a window of a larger picture. Here the window is the size
 * of the whole picture, only moved: by `x` to the right and `y` down, so everything in it
 * appears `x` further left and `y` further up, and nothing is scaled. It changes the
 * projection matrix alone. The camera's position and target stay where they were, so a camera
 * link (D-52), the zoom limits and every distance rule are untouched, and whatever projects
 * with the camera's matrix (picking, labels, the shaders) follows without knowing.
 *
 * Two things had to be told:
 * - camera-controls works out where the pointer is, for zooming toward it, from the element's
 *   rectangle, taking the picture's center for the rectangle's. `setViewport` gives it a moved
 *   rectangle.
 * - On a resize, R3F rebuilds the projection with the offset's old full size, so the offset is
 *   applied again whenever `size` changes.
 *
 * It eases over VIEW_SHIFT_MS, asking for a frame only while it moves; resting, it costs
 * nothing. Capture mode's frame is the picture, so there it's always zero, at once.
 */
export function ViewShiftDriver() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const ease = useRef<Ease>({
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 0,
    x: 0,
    y: 0,
    startMs: 0,
    moving: false,
  });

  // A new place to shift to: when the panel reports what it covers, or capture mode changes.
  useEffect(() => {
    const retarget = () => {
      const state = ease.current;
      const capture = capturing();
      const next = capture ? ZERO : shiftFor(viewInsetsStore.getState());
      if (next.xPx === state.toX && next.yPx === state.toY) return;
      state.fromX = state.x;
      state.fromY = state.y;
      state.toX = next.xPx;
      state.toY = next.yPx;
      state.startMs = performance.now();
      state.moving = true;
      if (capture || matches('(prefers-reduced-motion: reduce)')) {
        // No slide: the frame after this one is already in place.
        state.startMs -= VIEW_SHIFT_MS;
      }
      invalidate();
    };
    retarget();
    const stops = [viewInsetsStore.subscribe(retarget), useCapture.subscribe(retarget)];
    return () => {
      for (const stop of stops) stop();
    };
  }, [invalidate]);

  // The canvas changed size, or the camera or its controls were replaced: apply it again.
  useEffect(() => {
    const state = ease.current;
    apply(camera, controls, size, state.x, state.y);
    invalidate();
    return () => {
      apply(camera, controls, size, 0, 0);
    };
  }, [camera, controls, size, invalidate]);

  useFrame(() => {
    const state = ease.current;
    if (!state.moving) return;
    const progress = Math.min(1, (performance.now() - state.startMs) / VIEW_SHIFT_MS);
    // Ease out: quick at first, settling gently, as the sheet's own move does.
    const eased = 1 - (1 - progress) ** 3;
    state.x = state.fromX + (state.toX - state.fromX) * eased;
    state.y = state.fromY + (state.toY - state.fromY) * eased;
    apply(camera, controls, size, state.x, state.y);
    if (progress < 1) invalidate();
    else state.moving = false;
  });
  return null;
}

const ZERO = { xPx: 0, yPx: 0 };

/**
 * Moves the picture `xPx` left and `yPx` up, in CSS pixels, or puts it back at zero.
 *
 * `setViewOffset`'s `x` and `y` say where the window starts in the full picture, from its top
 * left: a window starting `xPx` to the right shows what was right of center at its center, so
 * the picture has moved left; starting `yPx` down, it has moved up.
 *
 * `setViewport(x, y, width, height)` is camera-controls' rectangle for the picture inside the
 * element, measured from the element's bottom left with y running up (as WebGL viewports are).
 * The picture moved left and up, so the rectangle is at `-xPx` and `+yPx`.
 */
function apply(
  camera: Camera,
  controls: unknown,
  size: { width: number; height: number },
  xPx: number,
  yPx: number,
): void {
  if (!(camera instanceof PerspectiveCamera)) return;
  const shifted = xPx !== 0 || yPx !== 0;
  if (shifted) {
    camera.setViewOffset(size.width, size.height, xPx, yPx, size.width, size.height);
  } else if (camera.view?.enabled) {
    camera.clearViewOffset();
  }
  if (controls instanceof CameraControlsImpl) {
    if (shifted) controls.setViewport(-xPx, yPx, size.width, size.height);
    // Null clears it; the other arguments are ignored then, but the types ask for them.
    else controls.setViewport(null, 0, 0, 0);
  }
}
