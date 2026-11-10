import { viewLevels, type ViewLevel } from '@ge/domain';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { levels } from '@/levels/registry.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';

interface SubjectViewPanelsProps {
  level: Exclude<ViewLevel, 'galaxy'>;
  subjectId: string;
}

/**
 * The page's panels over a system or orbit view: its loading and error states, and the notice
 * of a view not built yet (the orbit view until M6). The editing tools, the outliner and the
 * info panel join in M5-T4.
 */
export function SubjectViewPanels({ level, subjectId }: SubjectViewPanelsProps) {
  const view = useViewPayload(level, subjectId, useReadOptions());
  const policy = useSpoilerPolicy();
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
  return null;
}
