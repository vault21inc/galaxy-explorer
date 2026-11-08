import { Suspense } from 'react';
import { levels } from '@/levels/registry.ts';
import { useNavigation } from '@/state/navigation.ts';

/** Draws the current view, from the levels registry (rendering.md §4). */
export function ViewHost() {
  const current = useNavigation((state) => state.current);
  if (!current) return null;
  const Level = levels[current.level]?.component;
  if (!Level) return null;
  return (
    // While a view's code loads, the canvas shows just the sky.
    <Suspense fallback={null}>
      <Level key={`${current.level}:${current.subjectId}`} subjectId={current.subjectId} />
    </Suspense>
  );
}
