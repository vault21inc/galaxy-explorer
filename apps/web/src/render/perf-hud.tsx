import { useEffect, useState } from 'react';
import { frameTimeline, renderInfo, type RenderInfo } from './diagnostics.ts';
import type { FrameStats } from './frame-timeline.ts';

/** How often the HUD refreshes, in milliseconds. It reads numbers; it never triggers frames. */
const REFRESH_MS = 500;

/** The HUD's statistics cover this many recent milliseconds. */
const WINDOW_MS = 2_000;

interface Snapshot {
  frames: FrameStats;
  render: RenderInfo | undefined;
}

/**
 * The developer performance HUD, shown with `?perf=1` in development (rendering.md §14). It's
 * plain DOM over the canvas and polls twice a second, so it adds no frames of its own: when the
 * scene is still it reads "idle", which is how on-demand rendering should look.
 *
 * It replaces r3f-perf, which hasn't been updated for React 19 and React Three Fiber 9.
 */
export function PerfHud() {
  const [snapshot, setSnapshot] = useState<Snapshot>(takeSnapshot);

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(takeSnapshot());
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const { frames, render } = snapshot;
  const fps = frames.medianMs > 0 ? Math.round(1000 / frames.medianMs) : 0;
  const rows: [string, string][] = [
    ['fps', frames.count < 2 ? 'idle' : String(fps)],
    ['frame ms', frames.count < 2 ? '–' : `${fmt(frames.medianMs)} / p95 ${fmt(frames.p95Ms)}`],
    ['frames', String(frameTimeline.frameCount)],
    ['draw calls', String(render?.calls ?? '–')],
    ['triangles', String(render?.triangles ?? '–')],
    ['points', String(render?.points ?? '–')],
    ['geo / tex', render ? `${String(render.geometries)} / ${String(render.textures)}` : '–'],
    ['dpr', render ? fmt(render.dpr) : '–'],
  ];

  return (
    <dl
      aria-label="Performance HUD"
      className="pointer-events-none absolute bottom-3 left-3 grid grid-cols-[auto_auto] gap-x-3 rounded-md border bg-card px-3 py-2 font-mono text-xs text-muted-foreground"
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="text-right text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function takeSnapshot(): Snapshot {
  return {
    frames: frameTimeline.stats(performance.now() - WINDOW_MS),
    render: renderInfo(),
  };
}

function fmt(value: number): string {
  return value.toFixed(1);
}
