import type { ViewLevel } from '@ge/domain';
import { lazy, type ComponentType } from 'react';

export interface LevelDef {
  /** Draws the view inside the canvas; loaded on first use, so each view is its own chunk. */
  component: ComponentType<{ subjectId: string }>;
}

/**
 * The view levels the canvas can draw (architecture.md §3.5). The system and orbit views
 * arrive in M5 and M6, with their camera limits and enter and exit distances.
 */
export const levels: Partial<Record<ViewLevel, LevelDef>> = {
  galaxy: { component: lazy(() => import('./galaxy-level.tsx')) },
};
