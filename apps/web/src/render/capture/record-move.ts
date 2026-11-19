import { CameraControlsImpl } from '@react-three/drei';
import type { RootState } from '@react-three/fiber';
import { Vector3 } from 'three';
import { poseAt, type MovePlan } from '../camera/capture-move.ts';
import { shownLabels } from '../labels/label-pool.ts';
import { useCapture } from '@/state/capture.ts';
import { CAPTURE_RECORD_BITRATE_BPS, CAPTURE_RECORD_SETTLE_MS } from '../tuning.ts';
import { paintLabels } from './paint-labels.ts';

/**
 * Records capture mode's move to an MP4 file at an exact size (D-56, rendering.md §16), such
 * as 1080 × 1920 for a Reel.
 *
 * A screen recording captures whatever the screen shows, at the screen's size, in real time,
 * so a slow frame becomes a stutter. This draws the move frame by frame instead, each at its
 * exact moment (frame i is at i ÷ fps seconds), however long a frame takes to draw, and hands
 * each to the browser's video encoder (WebCodecs, H.264). The clip is smooth on any machine.
 *
 * How, step by step:
 * 1. The canvas stops drawing on its own (`frameloop` 'never'), and its pixel ratio is raised
 *    so its pixels are the clip's: the frame on screen is exactly the clip's shape
 *    (`captureFrame`), so 1080 ÷ its CSS width is the ratio that makes it 1080 pixels wide.
 *    Both go through the capture store to `<Stage>`'s props (`recordDpr`), so a React render
 *    of the canvas during the recording keeps them instead of resetting them.
 * 2. For each frame: the camera is put where the move is at that moment, the canvas draws once
 *    (`advance`, which also runs every per-frame hook and the labels' placement), its picture
 *    is copied into a 2D canvas of the clip's size with the labels painted over it (they're
 *    HTML on screen), and that is encoded.
 * 3. The encoder's output goes into an MP4 (mediabunny, loaded only now), held in memory and
 *    returned as a file. Whatever happens, the canvas's pixel ratio and frame loop come back.
 *
 * WebGL clears its picture after it reaches the screen, so each frame is copied in the same
 * task that drew it, before the browser gets the chance.
 */

let getRoot: (() => RootState) | null = null;

/** Called by `<CaptureRecorderRig>` inside the canvas. */
export function attachRecorder(get: (() => RootState) | null): void {
  getRoot = get;
}

export interface RecordOptions {
  plan: MovePlan;
  /** The clip's size in pixels. */
  width: number;
  height: number;
  fps: number;
  /** The move's length, and the still time before and after it, in seconds. */
  durationS: number;
  holdS: number;
  /** Called after each frame with the share done, 0 to 1. */
  onProgress: (done: number) => void;
  signal: AbortSignal;
}

/** The browser can't encode H.264 at this size (some Linux builds of Chromium). */
export class RecordingUnsupportedError extends Error {}

// Reused for every frame: nothing is allocated per frame but the encoder's own work.
const position = new Vector3();
const target = new Vector3();

export async function recordMove(options: RecordOptions): Promise<Blob> {
  const { plan, width, height, fps, durationS, holdS, onProgress, signal } = options;
  const root = getRoot?.();
  const controls = root?.controls;
  if (!root || !(controls instanceof CameraControlsImpl)) throw new Error('No view to record.');

  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo } =
    await import('mediabunny');
  // Bits a second, scaled with the frame rate: the same quality per frame at 60 as at 30.
  const quality = new Quality({ bitrate: Math.round((CAPTURE_RECORD_BITRATE_BPS * fps) / 30) });
  if (!(await canEncodeVideo('avc', { width, height, quality, frameRate: fps }))) {
    throw new RecordingUnsupportedError('This browser can’t encode H.264 video at this size.');
  }

  const clip = document.createElement('canvas');
  clip.width = width;
  clip.height = height;
  const context = clip.getContext('2d');
  if (!context) throw new Error('No 2D canvas to record into.');

  const { gl, size } = root;
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(clip, { codec: 'avc', quality });
  output.addVideoTrack(source, { frameRate: fps });

  // The + 0.5 keeps the canvas from being one pixel short: three.js rounds its width down, and
  // 477 × (1080 ÷ 477) can come out as 1079.999….
  useCapture.getState().setRecordDpr((width + 0.5) / size.width);
  // The reader's own input can't move the camera mid-clip.
  controls.enabled = false;
  try {
    // React applies the new props to the canvas; wait for that before the first frame.
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_RECORD_SETTLE_MS));
    await output.start();
    const total = Math.round((durationS + 2 * holdS) * fps);
    // How much the clip's pixels are larger than the frame's CSS pixels, for the labels.
    const scale = width / size.width;
    // The canvas's clock goes on from where it is, one frame's time per frame.
    const clockStartS = root.clock.elapsedTime;
    for (let frame = 0; frame < total; frame++) {
      if (signal.aborted) {
        await output.cancel();
        throw new DOMException('The recording was stopped.', 'AbortError');
      }
      const timeS = frame / fps;
      // Before the move starts this is below 0 and after it ends above 1: poseAt holds still.
      poseAt(plan, (timeS - holdS) / durationS, position, target);
      void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z);
      // One frame, drawn now: R3F's clock is in seconds while the loop is 'never'.
      root.advance(clockStartS + timeS, true);
      context.drawImage(gl.domElement, 0, 0, width, height);
      paintLabels(context, shownLabels(), scale);
      // Waits while the encoder is busy, so frames don't pile up in memory.
      await source.add(timeS, 1 / fps);
      onProgress((frame + 1) / total);
    }
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The recording came out empty.');
    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    controls.enabled = true;
    useCapture.getState().setRecordDpr(null);
    root.invalidate();
  }
}
