import { lazy, Suspense, useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { TourLayer } from '@/help/tour-layer.tsx';
import { captureFrame } from '@/lib/capture-params.ts';
import { useLayoutTier } from '@/lib/layout-tier.ts';
import { useHasFinePointer } from '@/lib/pointer-kind.ts';
import { cn } from '@/lib/utils.ts';
import { LabelLayer } from '@/render/labels/label-layer.tsx';
import { Stage } from '@/render/stage.tsx';
import { ProgressRing } from '@/render/transition/progress-ring.tsx';
import { TransitionOverlay } from '@/render/transition/transition-overlay.tsx';
import { useCapture } from '@/state/capture.ts';
import { useReducedMotion } from '@/state/quality.ts';
import { CaptureCard } from './capture-card.tsx';
import { CaptureControls } from './capture-controls.tsx';
import { QualityNotice } from './quality-notice.tsx';
import { Toaster } from './toaster.tsx';
import { TopBar } from './top-bar.tsx';
import { useElementSize } from './use-element-size.ts';

// Loaded only in development, and only when `?perf=1` asks for it.
const PerfHud = import.meta.env.DEV
  ? lazy(() => import('@/render/perf-hud.tsx').then((module) => ({ default: module.PerfHud })))
  : null;

/**
 * The layout every page shares (ux.md §1): the canvas fills the window, and the top bar and
 * the page's own panels float above it. The canvas stays mounted across route changes.
 *
 * In capture mode (D-55, ux.md §14) the canvas, its labels and its fades shrink to a centred
 * frame of the chosen shape, on black, and everything else is hidden. Hidden, not removed: the
 * map page underneath keeps the view in step with the address.
 */
export function AppShell() {
  const [searchParams] = useSearchParams();
  const showPerfHud = PerfHud !== null && searchParams.get('perf') === '1';
  const aspect = useCapture((state) => state.aspect);
  const playing = useCapture((state) => state.move !== null);
  const recording = useCapture((state) => state.recording !== null);
  const reducedMotion = useReducedMotion();
  const shell = useRef<HTMLDivElement>(null);
  const size = useElementSize(shell);
  const frame = aspect && size ? captureFrame(size.width, size.height, aspect) : null;
  const slim = useLayoutTier() === 'slim';
  const finePointer = useHasFinePointer();
  const touchControls = slim || !finePointer;

  return (
    <div
      ref={shell}
      data-capture={aspect?.id}
      // The pointer would be in the recording: hide it while the move plays.
      className={cn(
        'relative h-full w-full',
        aspect && 'bg-black',
        (playing || recording) && 'cursor-none',
      )}
    >
      <div
        data-testid="view-frame"
        className={frame ? 'absolute overflow-hidden' : 'absolute inset-0'}
        style={frame ?? undefined}
      >
        <div className="absolute inset-0">
          <Stage />
        </div>
        <LabelLayer />
        {/* Fills while zooming past the point where the view changes (M5-T2). */}
        <ProgressRing />
        {/* The fade between views covers the canvas and labels, not the top bar. */}
        <TransitionOverlay />
        {recording && (
          // While a clip records (D-56), the pointer can't reach the canvas. With reduced
          // motion asked for, the move being drawn is hidden too: the file still gets it.
          <div
            data-testid="recording-cover"
            className={cn(
              'absolute inset-0 flex items-center justify-center text-sm text-muted-foreground',
              reducedMotion && 'bg-black',
            )}
          >
            {reducedMotion && 'Recording…'}
          </div>
        )}
      </div>
      <div className={aspect ? 'hidden' : 'contents'}>
        <TopBar />
        <Outlet />
        {/* The guided tours and their offers (M8-T10), over the page's panels. */}
        <TourLayer />
        <QualityNotice />
        <Toaster />
      </div>
      {aspect && frame && size && !touchControls && (
        <CaptureCard aspect={aspect} frame={frame} containerWidth={size.width} />
      )}
      {/* Capture's keys as buttons, on a phone or without a mouse or trackpad (L3-T5). */}
      {aspect && touchControls && <CaptureControls />}
      {showPerfHud && (
        <Suspense fallback={null}>
          <PerfHud />
        </Suspense>
      )}
    </div>
  );
}
