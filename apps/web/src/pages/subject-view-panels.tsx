import { viewLevels, type ViewLevel } from '@ge/domain';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { levels } from '@/levels/registry.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { ViewPanels } from './view-panels.tsx';

interface SubjectViewPanelsProps {
  universeId: string;
  universeSlug: string;
  mapId: string;
  level: Exclude<ViewLevel, 'galaxy'>;
  subjectId: string;
}

/**
 * The page's panels over a system or orbit view: its loading and error states, the notice of a
 * view not built yet (the orbit view until M6), and otherwise the same panels as the galaxy
 * view's (view-panels.tsx) for the subject's children: outliner, toolbar, History and info.
 */
export function SubjectViewPanels({
  universeId,
  universeSlug,
  mapId,
  level,
  subjectId,
}: SubjectViewPanelsProps) {
  const view = useViewPayload(level, subjectId, useReadOptions());
  const policy = useSpoilerPolicy();
  const { placeholder, edit } = levels[level];
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
  if (!edit) return null;
  return (
    <ViewPanels
      universeId={universeId}
      universeSlug={universeSlug}
      mapId={mapId}
      objects={view.data.children}
      pins={'pins' in view.data ? view.data.pins : view.data.markers}
      mapSettings={edit.mapSettings}
      emptyTitle={edit.emptyTitle}
    />
  );
}
