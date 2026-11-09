import { lazy, Suspense, useEffect } from 'react';
import { useParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { errorMessage, RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { SelectionAnnouncer } from '@/app/selection-announcer.tsx';
import { EditorActions } from '@/editor/actions/editor-actions.tsx';
import { EditToolbar } from '@/editor/edit-toolbar.tsx';
import { HistoryPanel } from '@/panels/history/history-panel.tsx';
import { useEditor } from '@/state/editor.ts';
import { useHistory } from '@/state/history.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import { useSelectionUrlSync } from '@/state/selection-url.ts';

// Loaded on first use: it brings the rich-text parsers, which the galaxy view doesn't need.
const InfoPanel = lazy(() => import('@/panels/info-panel.tsx'));
// Edit mode only: the galaxy presets, sliders and underlay controls (M3-T8).
const MapSettingsPanel = lazy(() => import('@/panels/map-settings/map-settings-panel.tsx'));

/**
 * `/u/:universeSlug/:mapSlug`: the galaxy view of one map. It loads the galaxy view payload
 * (architecture.md §6) and tells the canvas to show it; the panels here cover loading, errors
 * and empty maps.
 */
export function MapPage() {
  const { universeSlug = '', mapSlug = '' } = useParams();
  const route = useUniverseRoute(universeSlug, mapSlug);
  const mapId = route.status === 'ready' ? route.map?.id : undefined;
  const view = useViewPayload('galaxy', mapId, useReadOptions());
  const show = useNavigation((state) => state.show);
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

  useEffect(() => {
    if (mapId === undefined) return;
    show({ level: 'galaxy', subjectId: mapId });
    return () => {
      show(null);
    };
  }, [mapId, show]);

  if (route.status !== 'ready') return <RouteStates route={route} />;
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
        {mapId && <EditorActions mapId={mapId} objects={view.data.objects} />}
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
      <EditToolbar />
      {mapId && <EditorActions mapId={mapId} objects={view.data.objects} />}
      {editing && <HistoryPanel universeId={route.universe.id} />}
      {editing && mapId && (
        <Suspense fallback={null}>
          <MapSettingsPanel universeId={route.universe.id} mapId={mapId} />
        </Suspense>
      )}
      {hasSelection && (
        <Suspense fallback={null}>
          <InfoPanel universeId={route.universe.id} objects={view.data.objects} />
        </Suspense>
      )}
    </>
  );
}
