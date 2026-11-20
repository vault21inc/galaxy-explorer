import { create } from 'zustand';
import type { CaptureAspect } from '@/lib/capture-params.ts';
import type { MovePlan } from '@/render/camera/capture-move.ts';

/**
 * Capture mode (D-55, ux.md §14): the canvas alone, framed to an aspect ratio for recording,
 * with a scripted camera move.
 *
 * The address holds the shot (lib/capture-params.ts); the map page mirrors its `capture` here
 * (pages/use-capture-mode.ts), so the shell, the canvas and the keys can read it without the
 * router. A move that's playing lives here too: the canvas's driver reads it on every frame
 * through `getState()`, never through React (rendering.md §2, rule 3).
 */

export interface PlayingMove {
  plan: MovePlan;
  /** `performance.now()` when the move itself starts, after the lead-in hold. */
  startsAtMs: number;
  durationMs: number;
}

interface CaptureState {
  /** The frame's shape, or null outside capture mode. */
  aspect: CaptureAspect | null;
  move: PlayingMove | null;
  /** A line for the keys' card: what just happened, or why P did nothing. */
  notice: string | null;
  /**
   * The reader marked the move's start in this visit to capture mode (A, or Start here). The
   * address's `cam` alone can't say so: a camera link (D-52) has one too. A marked start is
   * where a one-tap clip turns from; a link's isn't, since the reader has moved on since.
   */
  startMarked: boolean;
  setStartMarked: (marked: boolean) => void;
  /** A clip being recorded (D-56): how much is done, 0 to 1; null when none is. */
  recording: number | null;
  /**
   * While recording, the canvas's pixel ratio (`<Stage>` reads it), which makes the canvas's
   * pixels the clip's; null otherwise. Its frame loop is 'never' meanwhile.
   */
  recordDpr: number | null;
  /**
   * A finished clip to hand to the phone's share sheet (L3-T5): on a touch device a download
   * lands in Files, but Instagram reads Photos, and the share sheet has "Save Video". Sharing
   * needs a tap of its own, so it waits here for the Save or share button. Null otherwise.
   */
  shareable: File | null;
  setShareable: (file: File | null) => void;
  setAspect: (aspect: CaptureAspect | null) => void;
  play: (move: PlayingMove) => void;
  stop: () => void;
  setNotice: (notice: string | null) => void;
  setRecording: (recording: number | null) => void;
  setRecordDpr: (dpr: number | null) => void;
}

export const useCapture = create<CaptureState>()((set) => ({
  aspect: null,
  move: null,
  notice: null,
  startMarked: false,
  setStartMarked: (startMarked) => {
    set({ startMarked });
  },
  recording: null,
  recordDpr: null,
  shareable: null,
  setShareable: (shareable) => {
    set({ shareable });
  },
  setAspect: (aspect) => {
    set((state) =>
      state.aspect?.id === aspect?.id
        ? state
        : {
            aspect,
            ...(aspect === null
              ? { move: null, notice: null, shareable: null, startMarked: false }
              : {}),
          },
    );
  },
  play: (move) => {
    set({ move, notice: null });
  },
  stop: () => {
    set((state) => (state.move === null ? state : { move: null }));
  },
  setNotice: (notice) => {
    set({ notice });
  },
  setRecording: (recording) => {
    set({ recording });
  },
  setRecordDpr: (recordDpr) => {
    set({ recordDpr });
  },
}));

/** Whether capture mode is on: for code that runs per frame, outside React. */
export function capturing(): boolean {
  return useCapture.getState().aspect !== null;
}
