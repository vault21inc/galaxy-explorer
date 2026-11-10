import { lazy, Suspense, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { errorMessage, RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { SelectionAnnouncer } from '@/app/selection-announcer.tsx';
import { EditorActions } from '@/editor/actions/editor-actions.tsx';
import { EditToolbar } from '@/editor/edit-toolbar.tsx';
import { HistoryPanel } from '@/panels/history/history-panel.tsx';
import { OutlinerSlot } from '@/panels/outliner/outliner-slot.tsx';
import { useEditor } from '@/state/editor.ts';
import { useHistory } from '@/state/history.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { useViewSync } from '@/state/use-view-sync.ts';
import { useSelection } from '@/state/selection.ts';
import { useSelectionUrlSync } from '@/state/selection-url.ts';
import { viewPath } from '@/state/view-navigator.ts';
import { SubjectViewPanels } from './subject-view-panels.tsx';

// Loaded on first use: it brings the rich-text parsers, which the galaxy view doesn't need.
const InfoPanel = lazy(() => import('@/panels/info-panel.tsx'));
// Edit mode only: the galaxy presets, sliders and underlay controls (M3-T8).
const MapSettingsPanel = lazy(() => import('@/panels/map-settings/map-settings-panel.tsx'));

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
  const hasSelection = useSelection((state) => state.selectedIds.length > 0);
  const editing = useEditor((state) => state.editing);
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
  if (!view.data) return <StatusPanel tone="loading" title="Loading the galaxy…" />;
  if (view.data.objects.length === 0) {
    return (
      <>
        <StatusPanel tone="empty" title="This map is empty">
          Add objects in edit mode (E) with the toolbar’s Add button, or press N.
        </StatusPanel>
        <EditToolbar />
        {/* Nothing to select here, but undo still works (after deleting the last object). */}
        {mapId && (
          <EditorActions
            mapId={mapId}
            universeSlug={universeSlug}
            objects={view.data.objects}
            groups={view.data.groups}
            groupTypes={view.data.groupTypes}
          />
        )}
        {editing && <HistoryPanel universeId={route.universe.id} />}
        {editing && mapId && (
          <Suspense fallback={null}>
            <MapSettingsPanel universeId={route.universe.id} mapId={mapId} />
          </Suspense>
        )}
      </>
    );
  }
  return (
    <>
      <SelectionAnnouncer objects={view.data.objects} />
      <OutlinerSlot
        objects={view.data.objects}
        groups={view.data.groups}
        groupTypes={view.data.groupTypes}
        routes={view.data.routes}
      />
      <EditToolbar />
      {mapId && (
        <EditorActions
          mapId={mapId}
          universeSlug={universeSlug}
          objects={view.data.objects}
          groups={view.data.groups}
          groupTypes={view.data.groupTypes}
          routes={view.data.routes}
        />
      )}
      {editing && <HistoryPanel universeId={route.universe.id} />}
      {editing && mapId && (
        <Suspense fallback={null}>
          <MapSettingsPanel universeId={route.universe.id} mapId={mapId} />
        </Suspense>
      )}
      {hasSelection && (
        <Suspense fallback={null}>
          <InfoPanel
            universeId={route.universe.id}
            objects={view.data.objects}
            groups={view.data.groups}
            routes={view.data.routes}
          />
        </Suspense>
      )}
    </>
  );
}
