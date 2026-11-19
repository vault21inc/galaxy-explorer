import { useSearchParams } from 'react-router';
import { detectPlatform } from '@/input/platform.ts';
import {
  aspectLabel,
  parseCaptureShot,
  type CaptureAspect,
  type CaptureFrame,
} from '@/lib/capture-params.ts';
import { captureRows } from '@/panels/shortcut-help/help-sections.ts';
import { CAPTURE_HINT_MIN_BAR_PX } from '@/render/tuning.ts';
import { useCapture } from '@/state/capture.ts';
import { useReducedMotion } from '@/state/quality.ts';

/**
 * Capture mode's card (D-55, ux.md §14): the frame's size, the shot, and the keys, in the black
 * bar beside the frame, so it's never in what's recorded. Where the bars are too narrow to hold
 * it (a window close to the frame's shape), there's no card; the keys are in the shortcut help.
 */
export function CaptureCard({
  aspect,
  frame,
  containerWidth,
}: {
  aspect: CaptureAspect;
  frame: CaptureFrame;
  containerWidth: number;
}) {
  const [searchParams] = useSearchParams();
  const playing = useCapture((state) => state.move !== null);
  const notice = useCapture((state) => state.notice);
  const reducedMotion = useReducedMotion();
  const barPx = Math.min(frame.left, containerWidth - frame.left - frame.width);
  if (barPx < CAPTURE_HINT_MIN_BAR_PX) return null;
  const shot = parseCaptureShot(searchParams);
  const rows = captureRows(detectPlatform());

  return (
    <aside
      aria-label="Capture mode"
      data-testid="capture-card"
      className="absolute bottom-4 left-4 flex flex-col gap-3 rounded-lg border bg-card/80 p-3 text-xs text-muted-foreground transition-opacity"
      style={{ width: Math.min(barPx - 32, 300), opacity: playing ? 0.4 : 1 }}
    >
      <p className="text-sm text-foreground">
        Capture mode · {aspectLabel(aspect)} · {frame.width} × {frame.height} px
      </p>
      <p>
        Record the frame beside this card: in macOS, ⇧⌘5 and “Record Selected Portion”. This screen
        records it at {Math.round(frame.width * window.devicePixelRatio)} ×{' '}
        {Math.round(frame.height * window.devicePixelRatio)}.
      </p>
      <p>
        Move: {shot.start ? 'from the start you set' : 'from where the camera is'},{' '}
        {shot.end ? 'to the end you set' : 'no end set'}, {shot.durationS} s
        {shot.spinDeg !== 0 ? `, turning ${String(shot.spinDeg)}°` : ''}.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map((row) => (
          <div key={row.description} className="contents">
            <dt className="font-mono text-foreground">{row.keys.join(' ')}</dt>
            <dd>{row.description}</dd>
          </div>
        ))}
      </dl>
      {reducedMotion && (
        <p>Your system asks for reduced motion, so P cuts to the end instead of moving.</p>
      )}
      <p role="status" className="min-h-4 text-foreground">
        {playing ? 'Playing. P stops.' : notice}
      </p>
    </aside>
  );
}
