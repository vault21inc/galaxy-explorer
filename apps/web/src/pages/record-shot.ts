import { recordingSize, type CaptureAspect } from '@/lib/capture-params.ts';
import { recordMove, RecordingUnsupportedError } from '@/render/capture/record-move.ts';
import { CAPTURE_RECORD_HOLD_S } from '@/render/tuning.ts';
import { hasFinePointer, usesTouchControls } from '@/lib/pointer-kind.ts';
import { useCapture } from '@/state/capture.ts';
import { shotPlan } from './shot-plan.ts';

/**
 * R in capture mode (D-56): records the shot in the address to an MP4 at Instagram's size
 * (1080 × 1920 for 9:16) and saves it as a download. Progress and the outcome show on the
 * keys' card; Esc stops it.
 */

let running: AbortController | null = null;

/** Stops a recording under way, if there is one. */
export function cancelRecording(): void {
  running?.abort();
}

export async function recordShot(): Promise<void> {
  const capture = useCapture.getState();
  const aspect = capture.aspect;
  if (running || !aspect) return;
  capture.stop();
  const planned = shotPlan();
  if (!planned) return;
  const { shot, plan } = planned;
  const { width, height } = recordingSize(aspect);
  const controller = new AbortController();
  running = controller;
  capture.setNotice(null);
  capture.setShareable(null);
  capture.setRecording(0);
  // The card shows whole percents: at most 100 updates, not one per frame (rendering.md §2).
  let shownPercent = 0;
  try {
    const clip = await recordMove({
      plan,
      width,
      height,
      fps: shot.fps,
      durationS: shot.durationS,
      holdS: CAPTURE_RECORD_HOLD_S,
      signal: controller.signal,
      onProgress: (done) => {
        const percent = Math.floor(done * 100);
        if (percent === shownPercent) return;
        shownPercent = percent;
        useCapture.getState().setRecording(done);
      },
    });
    const name = clipName(aspect, new Date());
    // On a phone or tablet, the share sheet saves it to Photos; elsewhere, a download.
    const file = new File([clip], name, { type: 'video/mp4' });
    // `canShare` is missing from some browsers (Firefox on a desktop) though the types say not.
    if (!hasFinePointer() && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
      useCapture.getState().setShareable(file);
    } else {
      saveFile(clip, name);
    }
    const seconds = shot.durationS + 2 * CAPTURE_RECORD_HOLD_S;
    capture.setNotice(
      `Saved ${name}: ${String(width)} × ${String(height)}, ${String(seconds)} s at ${String(shot.fps)} fps.`,
    );
  } catch (error) {
    if (controller.signal.aborted) capture.setNotice('Recording stopped.');
    else if (error instanceof RecordingUnsupportedError) {
      capture.setNotice(
        usesTouchControls()
          ? `${error.message} Record the screen instead, or try another browser.`
          : `${error.message} Record the screen instead (⇧⌘5), or try Chrome or Safari.`,
      );
    } else {
      capture.setNotice(
        `Couldn’t record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    running = null;
    useCapture.getState().setRecording(null);
  }
}

/**
 * The file's name: the universe and map from the address, the frame, and when, such as
 * `milky-way-present-day-9x16-2026-11-18-1932.mp4`.
 */
export function clipName(aspect: CaptureAspect, at: Date, pathname = window.location.pathname) {
  const [, , universe = 'galaxy', map = 'map'] = pathname.split('/');
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${universe}-${map}-${aspect.id}-${stamp}.mp4`;
}

/** Hands a file to the browser to save, as a link with `download` would. */
function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the browser to have started saving it.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** Hands the finished clip to the share sheet: called from the Save or share button's tap. */
export async function shareClip(): Promise<void> {
  const file = useCapture.getState().shareable;
  if (!file) return;
  try {
    await navigator.share({ files: [file], title: file.name });
    useCapture.getState().setShareable(null);
  } catch (error) {
    // Closing the share sheet without choosing is an AbortError: the clip stays offered.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    useCapture
      .getState()
      .setNotice(`Couldn’t share: ${error instanceof Error ? error.message : String(error)}`);
  }
}
