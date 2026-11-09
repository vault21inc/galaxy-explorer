import { lazy, Suspense } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { LabelLayer } from '@/render/labels/label-layer.tsx';
import { Stage } from '@/render/stage.tsx';
import { QualityNotice } from './quality-notice.tsx';
import { Toaster } from './toaster.tsx';
import { TopBar } from './top-bar.tsx';

// Loaded only in development, and only when `?perf=1` asks for it.
const PerfHud = import.meta.env.DEV
  ? lazy(() => import('@/render/perf-hud.tsx').then((module) => ({ default: module.PerfHud })))
  : null;

/**
 * The layout every page shares (ux.md §1): the canvas fills the window, and the top bar and
 * the page's own panels float above it. The canvas stays mounted across route changes.
 */
export function AppShell() {
  const [searchParams] = useSearchParams();
  const showPerfHud = PerfHud !== null && searchParams.get('perf') === '1';

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <Stage />
      </div>
      <LabelLayer />
      <TopBar />
      <Outlet />
      <QualityNotice />
      <Toaster />
      {showPerfHud && (
        <Suspense fallback={null}>
          <PerfHud />
        </Suspense>
      )}
    </div>
  );
}
