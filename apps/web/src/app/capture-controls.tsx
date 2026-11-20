import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import { CAPTURE_ACTION_DESCRIPTIONS, type CaptureKeyAction } from '@/input/bindings.ts';
import { parseCaptureShot } from '@/lib/capture-params.ts';
import { shareClip } from '@/pages/record-shot.ts';
import { useCaptureActions } from '@/pages/use-capture-mode.ts';
import { useCapture } from '@/state/capture.ts';

/**
 * Each action's button text: short, for a phone's width. Typed by the actions, so a new key
 * can't be left without a button; what each does is CAPTURE_ACTION_DESCRIPTIONS, its title.
 */
const BUTTON_TEXT: Record<CaptureKeyAction, string> = {
  'mark-start': 'Start here',
  'mark-end': 'End here',
  'move-shorter': 'Shorter',
  'move-longer': 'Longer',
  'play-move': 'Play',
  'record-move': 'Record',
  'leave-capture': 'Leave',
};

/**
 * Which row each button is in: setting the move up, then doing something with it. Typed by the
 * actions, like the texts, so a new key lands in a row.
 */
const ROW: Record<CaptureKeyAction, 'set' | 'do'> = {
  'mark-start': 'set',
  'mark-end': 'set',
  'move-shorter': 'set',
  'move-longer': 'set',
  'play-move': 'do',
  'record-move': 'do',
  'leave-capture': 'do',
};

const ACTIONS = Object.keys(BUTTON_TEXT) as CaptureKeyAction[];
const ROWS = (['set', 'do'] as const).map((row) => ACTIONS.filter((action) => ROW[action] === row));

/**
 * What to do next, and which button does it. A move needs an end before it can play or
 * record, and a start that isn't the end: with neither set, the reader frames the start; with
 * a start, the end; then it's ready. The owner's first try on a phone was Record with no end
 * set, and nothing on screen said why it did nothing.
 */
function nextStep(shot: { start: unknown; end: unknown; spinDeg: number }): {
  action: CaptureKeyAction;
  hint: string;
} {
  if (shot.end || shot.spinDeg !== 0) {
    return {
      action: 'record-move',
      hint: 'Ready. Play previews the move; Record saves it as a video.',
    };
  }
  return shot.start
    ? {
        action: 'mark-end',
        hint: 'Next: move the camera to where the clip ends, then tap End here.',
      }
    : { action: 'mark-start', hint: 'First: frame where the clip starts, then tap Start here.' };
}

/**
 * Capture mode by touch (D-57, docs/plan/later/phone-usability.md, L3-T5): a button for each of
 * capture's keys, in two rows along the bottom of the window (setting the move up, then playing,
 * recording or leaving), with a line saying what's set and what just happened, and a second
 * saying what to do next. Shown on a phone, or wherever there's no mouse or trackpad (AppShell).
 *
 * It can't get into a clip: a recording is drawn from the canvas and its painted labels, never
 * from the page (rendering.md §16). It still hides while a move plays, so a screen recording
 * gets a clean frame; a tap on the frame then stops the move. While a clip records, Stop alone.
 */
export function CaptureControls() {
  const [searchParams] = useSearchParams();
  const run = useCaptureActions();
  const playing = useCapture((state) => state.move !== null);
  const recording = useCapture((state) => state.recording);
  const notice = useCapture((state) => state.notice);
  const shareable = useCapture((state) => state.shareable);
  const shot = parseCaptureShot(searchParams);
  const next = nextStep(shot);

  if (playing) {
    return (
      <button
        type="button"
        aria-label="Stop the move"
        className="absolute inset-0 z-10 cursor-none"
        onClick={() => {
          run('play-move');
        }}
      />
    );
  }

  const line =
    recording !== null
      ? `Recording: ${String(Math.floor(recording * 100))} %.`
      : (notice ??
        `${shot.start ? 'From your start' : 'From here'}, ${shot.end ? 'to your end' : 'no end set'}, ${String(shot.durationS)} s.`);

  return (
    <aside
      aria-label="Capture mode"
      data-testid="capture-controls"
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-black/70 px-[max(0.5rem,env(safe-area-inset-left))] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground"
    >
      <p role="status" className="min-h-4 text-center text-foreground">
        {line}
      </p>
      {recording === null && <p className="text-center">{next.hint}</p>}
      {recording !== null ? (
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            run('leave-capture');
          }}
        >
          Stop recording
        </Button>
      ) : (
        <div className="flex flex-col gap-1">
          {shareable && (
            <Button
              className="h-11"
              onClick={() => {
                void shareClip();
              }}
            >
              Save or share the clip
            </Button>
          )}
          {ROWS.map((row) => (
            <div key={row.join()} className="flex gap-1">
              {row.map((action) => (
                <Button
                  key={action}
                  // The filled button is the next step, so the eye is led through them.
                  variant={action === next.action ? 'default' : 'outline'}
                  title={CAPTURE_ACTION_DESCRIPTIONS[action]}
                  aria-current={action === next.action ? 'step' : undefined}
                  className="h-11 min-w-0 flex-1 px-2"
                  onClick={() => {
                    run(action);
                  }}
                >
                  {BUTTON_TEXT[action]}
                </Button>
              ))}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
