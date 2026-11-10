import { PUSH_RING_STROKE_PX } from '../tuning.ts';
import { usePushRing } from './push-ring-store.ts';

/**
 * The ring that fills while the reader keeps zooming past the point where a view would change
 * (rendering.md §4, ux.md §9), so entering or leaving feels intentional and the reader can see
 * how much more it takes. A DOM overlay: it changes only on wheel events, never per frame.
 *
 * The arc is an SVG circle whose dash pattern is one dash as long as the progress share of the
 * circumference, then a gap for the rest; rotated so it starts at the top.
 */
export function ProgressRing() {
  const ring = usePushRing((state) => state.ring);
  if (!ring) return null;
  const size = 2 * (ring.radiusPx + PUSH_RING_STROKE_PX);
  const circumference = 2 * Math.PI * ring.radiusPx;
  const filled = Math.min(1, ring.progress) * circumference;
  return (
    <svg
      aria-hidden
      data-testid="push-ring"
      data-progress={Math.min(1, ring.progress).toFixed(2)}
      width={size}
      height={size}
      className="pointer-events-none absolute"
      style={{ left: ring.x - size / 2, top: ring.y - size / 2 }}
    >
      <g transform={`rotate(-90 ${(size / 2).toString()} ${(size / 2).toString()})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={ring.radiusPx}
          fill="none"
          className="stroke-white/20"
          strokeWidth={PUSH_RING_STROKE_PX}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={ring.radiusPx}
          fill="none"
          className="stroke-primary"
          strokeWidth={PUSH_RING_STROKE_PX}
          strokeLinecap="round"
          strokeDasharray={`${filled.toString()} ${circumference.toString()}`}
        />
      </g>
    </svg>
  );
}
