import { CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useCapture } from '@/state/capture.ts';
import { useNavigation } from '@/state/navigation.ts';
import { poseAt } from './camera/capture-move.ts';

// Reused every frame: nothing is allocated while the move plays (rendering.md §2, rule 4).
const position = new Vector3();
const target = new Vector3();

/**
 * Plays capture mode's scripted move (D-55, rendering.md §16), inside the canvas.
 *
 * The canvas renders on demand (rendering.md §3), so a move keeps itself going: each frame
 * places the camera for the time now and asks for the next frame, until the move ends. Then the
 * canvas is idle again. It runs before camera-controls' own per-frame update (priority −2
 * against its −1), so the pose set here is the one drawn in the same frame, and it's set
 * without camera-controls' smoothing, which would lag behind the script.
 *
 * Taking the camera (a drag, a wheel, a pinch) or changing view stops the move.
 */
export function CaptureMoveDriver() {
  const controls = useThree((state) => state.controls);
  const invalidate = useThree((state) => state.invalidate);
  /** The timer that wakes the canvas when the lead-in hold ends. */
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new move: draw its first frame, which starts the loop.
  useEffect(
    () =>
      useCapture.subscribe((state, previous) => {
        if (state.move !== previous.move) {
          if (holdTimer.current !== null) clearTimeout(holdTimer.current);
          holdTimer.current = null;
          if (state.move) invalidate();
        }
      }),
    [invalidate],
  );

  useEffect(() => {
    if (!(controls instanceof CameraControlsImpl)) return;
    // 'controlstart' is the reader's own input only, never a call such as setLookAt.
    const stop = () => {
      useCapture.getState().stop();
    };
    controls.addEventListener('controlstart', stop);
    return () => {
      controls.removeEventListener('controlstart', stop);
    };
  }, [controls]);

  useEffect(
    () =>
      useNavigation.subscribe((state, previous) => {
        if (state.stack !== previous.stack) useCapture.getState().stop();
      }),
    [],
  );

  useEffect(
    () => () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    },
    [],
  );

  useFrame((state) => {
    const move = useCapture.getState().move;
    const camera = state.controls;
    if (!move || !(camera instanceof CameraControlsImpl)) return;
    const elapsedMs = performance.now() - move.startsAtMs;
    // A move of no length (reduced motion's cut) is at its end at once.
    const t = move.durationMs > 0 ? elapsedMs / move.durationMs : 1;
    poseAt(move.plan, t, position, target);
    // `false`: straight there, without camera-controls' easing.
    void camera.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false);
    if (t >= 1) {
      // The last frame has the end pose exactly; the canvas goes idle after it.
      useCapture.getState().stop();
      return;
    }
    if (elapsedMs < 0) {
      // Holding still at the start: no frames until the hold ends.
      holdTimer.current ??= setTimeout(() => {
        holdTimer.current = null;
        state.invalidate();
      }, -elapsedMs);
      return;
    }
    state.invalidate();
  }, -2);

  return null;
}
