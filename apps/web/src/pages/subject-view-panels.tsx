import { viewLevels, type ViewLevel } from '@ge/domain';
import { lazy, Suspense } from 'react';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { levels } from '@/levels/registry.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';

// Loaded on first use, as on the galaxy view (map-page.tsx).
const InfoPanel = lazy(() => import('@/panels/info-panel.tsx'));

interface SubjectViewPanelsProps {
  universeId: string;
  level: Exclude<ViewLevel, 'galaxy'>;
  subjectId: string;
}

/**
 * The page's panels over a system or orbit view: its loading and error states, and the notice
 * of a view not built yet (the orbit view until M6), and the info panel for a selected child
 * (zooming in to an object that opens no view selects it, M5-T2). The editing tools and the
 * outliner join in M5-T4.
 */
export function SubjectViewPanels({ universeId, level, subjectId }: SubjectViewPanelsProps) {
  const view = useViewPayload(level, subjectId, useReadOptions());
  const policy = useSpoilerPolicy();
  const hasSelection = useSelection((state) => state.selectedIds.length > 0);
  const { placeholder } = levels[level];
  const name = viewLevels[level].label.toLowerCase();
  if (view.error) {
    return (
      <StatusPanel
        tone="error"
        title={`Couldn't load this ${name}`}
        onRetry={() => void view.refetch()}
      >
        {errorMessage(view.error)}
      </StatusPanel>
    );
  }
  if (!view.data) return <StatusPanel tone="loading" title={`Loading the ${name}…`} />;
  if (placeholder) {
    return (
      <StatusPanel tone="empty" title={labelText(view.data.subject, policy)}>
        {placeholder}
      </StatusPanel>
    );
  }
  if (!hasSelection) return null;
  return (
    <Suspense fallback={null}>
      <InfoPanel universeId={universeId} objects={view.data.children} />
    </Suspense>
  );
}
