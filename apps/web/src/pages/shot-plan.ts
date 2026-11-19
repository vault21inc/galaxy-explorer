import { parseCaptureShot, type CaptureShot } from '@/lib/capture-params.ts';
import { planMove, type MovePlan } from '@/render/camera/capture-move.ts';
import { currentCameraPose } from '@/render/transition/transition-controller.ts';
import { CAMERA_FOV_DEG, CAPTURE_ZOOM_CURVATURE } from '@/render/tuning.ts';
import { useCapture } from '@/state/capture.ts';

/**
 * The move the address describes (D-55): from its start (`cam`, or where the camera is) to its
 * end (`to`, or the start again with `spin`). Null, with a line on the keys' card saying why,
 * when there's no end to move to. Shared by playing (P) and recording (R).
 */
export function shotPlan(): { shot: CaptureShot; plan: MovePlan } | null {
  const shot = parseCaptureShot(new URLSearchParams(window.location.search));
  const from = shot.start ?? currentCameraPose();
  if (!from) return null;
  const to = shot.end ?? (shot.spinDeg !== 0 ? from : null);
  if (!to) {
    useCapture
      .getState()
      .setNotice('Press B where the move should end first, or add spin= to the address.');
    return null;
  }
  const plan = planMove(from, to, {
    spinDeg: shot.spinDeg,
    curvature: CAPTURE_ZOOM_CURVATURE,
    fovDeg: CAMERA_FOV_DEG,
  });
  return { shot, plan };
}
