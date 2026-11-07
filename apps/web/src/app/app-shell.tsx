import { lazy, Suspense } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';
import { Stage } from '@/render/stage.tsx';

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
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-4 px-4 py-3">
        <Link
          to="/"
          className="pointer-events-auto text-sm font-semibold label-caps text-foreground"
        >
          Galaxy Explorer
        </Link>
      </header>
      <Outlet />
      {showPerfHud && (
        <Suspense fallback={null}>
          <PerfHud />
        </Suspense>
      )}
    </div>
  );
}
