import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  CAPTURE_KEY_BINDINGS,
  CAPTURE_BLOCKED_KEY_ACTIONS,
  KEY_BINDINGS,
} from '@/input/bindings.ts';
import { ignoresCameraKeys } from '@/input/use-keyboard.ts';
import { readableSearch } from '@/lib/camera-param.ts';
import {
  captureAspect,
  CAPTURE_PARAM,
  MOVE_END_PARAM,
  MOVE_SECONDS_PARAM,
  parseCaptureShot,
  stepDuration,
  withCapture,
  withPose,
} from '@/lib/capture-params.ts';
import { planMove } from '@/render/camera/capture-move.ts';
import { currentCameraPose } from '@/render/transition/transition-controller.ts';
import { useTransition } from '@/render/transition/transition-store.ts';
import {
  CAMERA_FOV_DEG,
  CAPTURE_LEAD_IN_MS,
  CAPTURE_ZOOM_CURVATURE,
  VIEW_REDUCED_FADE_MS,
} from '@/render/tuning.ts';
import { useCapture } from '@/state/capture.ts';
import { useEditor } from '@/state/editor.ts';
import { useHelp } from '@/state/help.ts';
import { usePalette } from '@/state/palette.ts';

/** Changes the query in place: no new history entry, and the entry's state kept. */
type UpdateSearch = (change: (params: URLSearchParams) => URLSearchParams) => void;

/**
 * Capture mode on the map page (D-55, ux.md §14): mirrors `?capture=` into the capture store,
 * which the shell reads to hide the interface and frame the canvas, and takes capture mode's
 * keys while it's on. Leaving the map page leaves capture mode.
 */
export function useCaptureMode(): void {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const aspect = captureAspect(searchParams.get(CAPTURE_PARAM));
  const aspectId = aspect?.id ?? null;
  // The keys' handler is added once per capture session; it reads the latest address.
  const here = useRef({ navigate, location });
  useEffect(() => {
    here.current = { navigate, location };
  });

  useEffect(() => {
    useCapture.getState().setAspect(captureAspect(aspectId));
    if (aspectId !== null) {
      // What's recorded is what readers see: not edit mode's drafts and tools.
      useEditor.getState().setEditing(false);
      useHelp.getState().setOpen(false);
    }
  }, [aspectId]);

  useEffect(
    () => () => {
      useCapture.getState().setAspect(null);
    },
    [],
  );

  useEffect(() => {
    if (aspectId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      // The palette, opened with ⌘K, still works here: its keys are its own.
      if (usePalette.getState().open || ignoresCameraKeys(event.target)) return;
      const action = CAPTURE_KEY_BINDINGS[event.key];
      const viewAction = KEY_BINDINGS[event.key];
      if (action) {
        // Before the view's own keys (input/use-keyboard.ts), which skip a prevented event.
        event.preventDefault();
        runCaptureKey(action, (change) => {
          const { navigate: go, location: at } = here.current;
          // Written with readable commas (`cam=1,2,3,…`), so a shot's address can be copied
          // from the address bar and written down.
          const search = readableSearch(change(new URLSearchParams(at.search)));
          void go({ search }, { replace: true, state: at.state as unknown });
        });
        return;
      }
      if (viewAction && CAPTURE_BLOCKED_KEY_ACTIONS.includes(viewAction)) {
        event.preventDefault();
        return;
      }
      // Moving the camera by key takes it from the script, as a drag does.
      if (viewAction && viewAction !== 'cycle-labels' && viewAction !== 'show-all-labels') {
        useCapture.getState().stop();
      }
    };
    // The capture phase on window runs before every bubbling listener, the view's keys included.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      useCapture.getState().stop();
    };
  }, [aspectId]);
}

function runCaptureKey(action: (typeof CAPTURE_KEY_BINDINGS)[string], update: UpdateSearch): void {
  const capture = useCapture.getState();
  switch (action) {
    case 'leave-capture':
      capture.stop();
      update((params) => withCapture(params, null));
      return;
    case 'mark-start':
    case 'mark-end': {
      const pose = currentCameraPose();
      if (!pose) return;
      capture.stop();
      const start = action === 'mark-start';
      update((params) => withPose(params, start ? 'cam' : MOVE_END_PARAM, pose));
      capture.setNotice(start ? 'The move starts here.' : 'The move ends here.');
      return;
    }
    case 'move-shorter':
    case 'move-longer': {
      const shot = parseCaptureShot(new URLSearchParams(window.location.search));
      const seconds = stepDuration(shot.durationS, action === 'move-longer' ? 1 : -1);
      update((params) => {
        const next = new URLSearchParams(params);
        next.set(MOVE_SECONDS_PARAM, String(seconds));
        return next;
      });
      capture.setNotice(`The move takes ${String(seconds)} s.`);
      return;
    }
    case 'play-move':
      if (capture.move) capture.stop();
      else playMove();
      return;
  }
}

/**
 * Plays the shot in the address: from its start (`cam`, or where the camera is) to its end
 * (`to`, or the start again with `spin`), after a short still hold. With reduced motion asked
 * for (ux.md §10), the camera doesn't move: a quick fade cuts to the end instead.
 */
function playMove(): void {
  const capture = useCapture.getState();
  const shot = parseCaptureShot(new URLSearchParams(window.location.search));
  const from = shot.start ?? currentCameraPose();
  if (!from) return;
  const to = shot.end ?? (shot.spinDeg !== 0 ? from : null);
  if (!to) {
    capture.setNotice('Press B where the move should end first, or add spin= to the address.');
    return;
  }
  const plan = planMove(from, to, {
    spinDeg: shot.spinDeg,
    curvature: CAPTURE_ZOOM_CURVATURE,
    fovDeg: CAMERA_FOV_DEG,
  });
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    capture.play({
      plan,
      startsAtMs: performance.now() + CAPTURE_LEAD_IN_MS,
      durationMs: shot.durationS * 1_000,
    });
    return;
  }
  // The same quick fade as a change of view with reduced motion (rendering.md §4).
  useTransition.setState({ opacity: 1, fadeMs: VIEW_REDUCED_FADE_MS });
  setTimeout(() => {
    // A move of no length: the driver puts the camera at the end in one frame.
    useCapture.getState().play({ plan, startsAtMs: performance.now(), durationMs: 0 });
    setTimeout(() => {
      useTransition.setState({ opacity: 0, fadeMs: VIEW_REDUCED_FADE_MS });
    }, VIEW_REDUCED_FADE_MS);
  }, VIEW_REDUCED_FADE_MS);
}
