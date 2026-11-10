import type { ViewLevel } from '@ge/domain';
import { lazy, type ComponentType } from 'react';

export interface LevelDef {
  /** Draws the view inside the canvas; loaded on first use, so each view is its own chunk. */
  component: ComponentType<{ subjectId: string }>;
  /**
   * A view not built yet: it opens, with breadcrumbs, but draws only the sky, and the page says
   * so with this text.
   */
  placeholder?: string;
}

/**
 * The view levels the canvas can draw (architecture.md §3.5). Each level's camera limits live
 * with its camera setup (render/galaxy/galaxy-camera.ts, render/system/system-camera.ts); M5-T2
 * adds the enter and exit distances.
 */
export const levels: Record<ViewLevel, LevelDef> = {
  galaxy: { component: lazy(() => import('./galaxy-level.tsx')) },
  system: { component: lazy(() => import('./system-level.tsx')) },
  orbit: {
    component: lazy(() => import('./orbit-level.tsx')),
    placeholder: 'The orbit view, with the globe and what’s on it, arrives in M6.',
  },
};
