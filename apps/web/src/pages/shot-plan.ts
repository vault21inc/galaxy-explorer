import { parseCaptureShot, type CaptureShot } from '@/lib/capture-params.ts';
import { usesTouchControls } from '@/lib/pointer-kind.ts';
import { planMove, type MovePlan } from '@/render/camera/capture-move.ts';
import { currentCameraPose } from '@/render/transition/transition-controller.ts';
import { CAMERA_FOV_DEG, CAPTURE_TURN_DEG_PER_S, CAPTURE_ZOOM_CURVATURE } from '@/render/tuning.ts';
import { useCapture } from '@/state/capture.ts';

/**
 * Whether the address describes a move: an end to go to (`to`), or a turn in place (`spin`).
 * Without one, capture mode's buttons make a slow turn of it (below); its keys ask for an end.
 */
export function hasMove(shot: CaptureShot): boolean {
  return shot.end !== null || shot.spinDeg !== 0;
}

/**
 * The move the address describes (D-55): from its start (`cam`, or where the camera is) to its
 * end (`to`, or the start again with `spin`). Shared by playing (P) and recording (R).
 *
 * With no end and no spin:
 * - **By capture mode's buttons** (a phone, or no mouse or trackpad): a slow turn around what
 *   the camera is looking at, CAPTURE_TURN_DEG_PER_S for the move's length. One tap on Record
 *   makes a clip. It starts where the camera is now, unless the reader marked a start in this
 *   visit: the address's `cam` may be a camera link's (D-52), left behind long ago.
 * - **By its keys:** null, with a line on the keys' card saying to press B or add `spin`.
 *   Editing the address is easy there, and the card teaches it.
 */
export function shotPlan(): { shot: CaptureShot; plan: MovePlan } | null {
  const shot = parseCaptureShot(new URLSearchParams(window.location.search));
  const capture = useCapture.getState();
  const options = { curvature: CAPTURE_ZOOM_CURVATURE, fovDeg: CAMERA_FOV_DEG };
  if (!hasMove(shot)) {
    if (!usesTouchControls()) {
      capture.setNotice('Press B where the move should end first, or add spin= to the address.');
      return null;
    }
    const from = (capture.startMarked ? shot.start : null) ?? currentCameraPose();
    if (!from) return null;
    const spinDeg = CAPTURE_TURN_DEG_PER_S * shot.durationS;
    return { shot, plan: planMove(from, from, { ...options, spinDeg }) };
  }
  const from = shot.start ?? currentCameraPose();
  if (!from) return null;
  const plan = planMove(from, shot.end ?? from, { ...options, spinDeg: shot.spinDeg });
  return { shot, plan };
}
