import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { errorMessage, RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { useHistory } from '@/state/history.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { useViewSync } from '@/state/use-view-sync.ts';
import { useSelectionUrlSync } from '@/state/selection-url.ts';
import { viewPath } from '@/state/view-navigator.ts';
import { levels } from '@/levels/registry.ts';
import { SubjectViewPanels } from './subject-view-panels.tsx';
import { ViewPanels } from './view-panels.tsx';

/**
 * `/u/:universeSlug/:mapSlug` and `…/view/:objectId`: one map, in its galaxy view or an object's
 * view (ux.md §9). The view sync turns the address into the views the canvas shows; the panels
 * here follow the view on top: the galaxy view's tools and panels, or the system or orbit
 * view's, and the loading, error and empty states.
 */
export function MapPage() {
  const { universeSlug = '', mapSlug = '', objectId } = useParams();
  const route = useUniverseRoute(universeSlug, mapSlug);
  const mapId = route.status === 'ready' ? route.map?.id : undefined;
  const view = useViewPayload('galaxy', mapId, useReadOptions());
  const problem = useViewSync({
    universeSlug,
    mapSlug,
    mapId,
    objectId,
    maps: route.status === 'ready' ? route.maps : [],
  });
  const top = useNavigation(topView);
  const universeId = route.status === 'ready' ? route.universe.id : undefined;
  useSelectionUrlSync();

  // Edits on this page are undo steps for this universe (M3-T6).
  useEffect(() => {
    if (universeId === undefined) return;
    useHistory.getState().setScope(universeId);
    return () => {
      useHistory.getState().setScope(null);
    };
  }, [universeId]);

  if (route.status !== 'ready') return <RouteStates route={route} />;
  if (problem?.kind === 'missing') {
    return (
      <StatusPanel tone="empty" title="No such object on this map">
        It may have been deleted, or be a draft only editors see.{' '}
        <Link to={viewPath(universeSlug, mapSlug, null)} className="text-primary underline">
          Open the galaxy view
        </Link>
        .
      </StatusPanel>
    );
  }
  if (problem?.kind === 'error') {
    return (
      <StatusPanel tone="error" title="Couldn't open this view" onRetry={problem.retry}>
        {errorMessage(problem.error)}
      </StatusPanel>
    );
  }
  // A system or orbit view: its own panels. The galaxy view's follow.
  if (top && top.level !== 'galaxy') {
    return (
      <SubjectViewPanels
        universeId={route.universe.id}
        universeSlug={universeSlug}
        mapId={mapId ?? ''}
        level={top.level}
        subjectId={top.subjectId}
      />
    );
  }
  if (view.error) {
    return (
      <StatusPanel tone="error" title="Couldn't load this map" onRetry={() => void view.refetch()}>
        {errorMessage(view.error)}
      </StatusPanel>
    );
  }
  if (!view.data || !mapId) return <StatusPanel tone="loading" title="Loading the galaxy…" />;
  const edit = levels.galaxy.edit;
  return (
    <ViewPanels
      universeId={route.universe.id}
      universeSlug={universeSlug}
      mapId={mapId}
      objects={view.data.objects}
      groups={view.data.groups}
      groupTypes={view.data.groupTypes}
      routes={view.data.routes}
      mapSettings={edit?.mapSettings ?? false}
      emptyTitle={edit?.emptyTitle ?? 'Nothing here yet'}
    />
  );
}
