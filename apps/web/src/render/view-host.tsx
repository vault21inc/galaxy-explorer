import { Suspense } from 'react';
import { levels } from '@/levels/registry.ts';
import { topView, useNavigation } from '@/state/navigation.ts';

/**
 * Draws the view on top of the navigation stack, from the levels registry (rendering.md §4).
 * The views below it aren't drawn: entering a system unmounts the galaxy view, which frees its
 * GPU resources, and leaving draws it again from TanStack Query's cached payload.
 */
export function ViewHost() {
  const current = useNavigation(topView);
  if (!current) return null;
  const Level = levels[current.level].component;
  return (
    // While a view's code loads, the canvas shows just the sky.
    <Suspense fallback={null}>
      <Level key={`${current.level}:${current.subjectId}`} subjectId={current.subjectId} />
    </Suspense>
  );
}
