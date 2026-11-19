import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  CAPTURE_KEY_BINDINGS,
  CAPTURE_BLOCKED_KEY_ACTIONS,
  KEY_BINDINGS,
  type CaptureKeyAction,
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
import { currentCameraPose } from '@/render/transition/transition-controller.ts';
import { useTransition } from '@/render/transition/transition-store.ts';
import { CAPTURE_LEAD_IN_MS, VIEW_REDUCED_FADE_MS } from '@/render/tuning.ts';
import { useCapture } from '@/state/capture.ts';
import { useEditor } from '@/state/editor.ts';
import { useHelp } from '@/state/help.ts';
import { usePalette } from '@/state/palette.ts';
import { cancelRecording, recordShot } from './record-shot.ts';
import { shotPlan } from './shot-plan.ts';

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
      // While a clip records, the camera is the recorder's: every key waits, but Esc stops it.
      if (useCapture.getState().recording !== null) {
        event.preventDefault();
        if (action === 'leave-capture') cancelRecording();
        return;
      }
      if (action) {
        // Before the view's own keys (input/use-keyboard.ts), which skip a prevented event.
        event.preventDefault();
        runCaptureKey(action, searchUpdater(here.current));
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
      cancelRecording();
    };
  }, [aspectId]);
}

/**
 * Changes the address's query in place, for capture's actions: written with readable commas
 * (`cam=1,2,3,…`), so a shot's address can be copied from the address bar and written down.
 */
function searchUpdater(here: {
  navigate: ReturnType<typeof useNavigate>;
  location: ReturnType<typeof useLocation>;
}): UpdateSearch {
  return (change) => {
    const search = readableSearch(change(new URLSearchParams(here.location.search)));
    void here.navigate({ search }, { replace: true, state: here.location.state as unknown });
  };
}

/**
 * Capture's actions for buttons (app/capture-controls.tsx, L3-T5): what each key does, without
 * a keyboard. While a clip records, only leaving does anything: it stops the recording.
 */
export function useCaptureActions(): (action: CaptureKeyAction) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return (action) => {
    if (useCapture.getState().recording !== null) {
      if (action === 'leave-capture') cancelRecording();
      return;
    }
    runCaptureKey(action, searchUpdater({ navigate, location }));
  };
}

function runCaptureKey(action: CaptureKeyAction, update: UpdateSearch): void {
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
    case 'record-move':
      void recordShot();
      return;
  }
}

/**
 * Plays the shot in the address: from its start (`cam`, or where the camera is) to its end
 * (`to`, or the start again with `spin`), after a short still hold. With reduced motion asked
 * for (ux.md §10), the camera doesn't move: a quick fade cuts to the end instead.
 */
function playMove(): void {
  const planned = shotPlan();
  if (!planned) return;
  const { shot, plan } = planned;
  const capture = useCapture.getState();
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
