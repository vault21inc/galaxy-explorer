import { CONFIG_RESOURCES } from '@ge/domain';
import { useParams } from 'react-router';
import { RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { containerName } from '@/lib/container-name.ts';
import { ConfigTable } from '@/panels/config-table/config-table.tsx';
import { ImportExportSection } from '@/panels/import-export/import-export-section.tsx';
import { UniverseDetails } from '@/panels/universe-details/universe-details.tsx';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { LeaveUniverse } from './universe-settings/leave-universe.tsx';
import { SharingSection } from './universe-settings/sharing-section.tsx';
import { FULL_PAGE_PANEL } from '@/app/panel-classes.ts';

/**
 * `/u/:universeSlug/settings` (M4-T1): the universe's details, who it's shared with (M8-T12),
 * then one table per config resource in the registry (group types, event categories, object
 * subtypes, field definitions), then import and export (M7-T4). For its owner and editors; a
 * viewer is told whose it is, and may leave it. It floats over the canvas like the other pages, and its controls keep the
 * arrow keys to themselves (`data-keys="own"`), so reordering a row doesn't pan the camera.
 */
export function UniverseSettingsPage() {
  const { universeSlug = '' } = useParams();
  const route = useUniverseRoute(universeSlug);
  const canEdit = useCanEdit();
  const policy = useSpoilerPolicy();
  if (route.status !== 'ready') return <RouteStates route={route} />;
  if (!canEdit) {
    const { universe } = route;
    return (
      <StatusPanel tone="empty" title="Settings are for its owner and editors">
        <p>
          {universe.role === 'viewer'
            ? `${universe.owner ?? 'Its owner'} shared this universe with you to read.`
            : 'Sign in as its owner or an editor to change this universe’s settings.'}
        </p>
        {universe.role === 'viewer' && (
          <div className="mt-3 flex">
            <LeaveUniverse universe={universe} />
          </div>
        )}
      </StatusPanel>
    );
  }

  const { universe } = route;
  return (
    <main
      aria-labelledby="settings-heading"
      data-keys="own"
      className={`${FULL_PAGE_PANEL} mx-auto flex max-w-6xl flex-col gap-8 overflow-y-auto rounded-lg border bg-card p-6 text-sm`}
    >
      <h1 id="settings-heading" className="text-base font-semibold">
        {containerName(universe, policy)}: settings
      </h1>
      <section aria-labelledby="settings-universe" className="flex flex-col gap-2">
        <h2 id="settings-universe" className="text-xs text-muted-foreground label-caps">
          Universe
        </h2>
        <UniverseDetails universe={universe} />
      </section>
      <SharingSection universe={universe} />
      {CONFIG_RESOURCES.map((resource) => (
        <ConfigTable key={resource} resource={resource} universeId={universe.id} />
      ))}
      <ImportExportSection universeId={universe.id} />
    </main>
  );
}
