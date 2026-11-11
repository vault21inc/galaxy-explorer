import type { ViewPin, ViewGroup, ViewGroupType, ViewObject, ViewRoute } from '@ge/domain';
import { lazy, Suspense } from 'react';
import { SelectionAnnouncer } from '@/app/selection-announcer.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { EditorActions } from '@/editor/actions/editor-actions.tsx';
import { EditToolbar } from '@/editor/edit-toolbar.tsx';
import { HistoryPanel } from '@/panels/history/history-panel.tsx';
import { OutlinerSlot } from '@/panels/outliner/outliner-slot.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';

// Loaded on first use: it brings the rich-text parsers, which the views don't need.
const InfoPanel = lazy(() => import('@/panels/info-panel.tsx'));
// Edit mode only: the galaxy presets, sliders and underlay controls (M3-T8).
const MapSettingsPanel = lazy(() => import('@/panels/map-settings/map-settings-panel.tsx'));

interface ViewPanelsProps {
  universeId: string;
  universeSlug: string;
  mapId: string;
  /** The view's objects: the galaxy's top level, or a system's children. */
  objects: readonly ViewObject[];
  groups?: readonly ViewGroup[];
  groupTypes?: readonly ViewGroupType[];
  routes?: readonly ViewRoute[];
  /** An orbit view's places and events, selectable as pins (M6-T4). */
  pins?: readonly ViewPin[];
  /** The Map settings panel belongs to this view (levels/registry.ts). */
  mapSettings: boolean;
  /** What an empty view says (levels/registry.ts `emptyTitle`). */
  emptyTitle: string;
}

/**
 * The page's panels over any view that can be edited (M5-T4): the outliner, the edit toolbar
 * and its commands, History, Map settings where they belong, and the info panel. The galaxy
 * and system views both use it, with their own objects; an empty view says so instead of
 * offering the outliner.
 */
export function ViewPanels({
  universeId,
  universeSlug,
  mapId,
  objects,
  groups = [],
  groupTypes = [],
  routes = [],
  pins = [],
  mapSettings,
  emptyTitle,
}: ViewPanelsProps) {
  const hasSelection = useSelection((state) => state.selectedIds.length > 0);
  const editing = useEditor((state) => state.editing);
  const empty = objects.length === 0;
  return (
    <>
      {empty ? (
        <StatusPanel tone="empty" title={emptyTitle}>
          Add objects in edit mode (E) with the toolbar’s Add button, or press N.
        </StatusPanel>
      ) : (
        <>
          <SelectionAnnouncer objects={objects} />
          <OutlinerSlot objects={objects} groups={groups} groupTypes={groupTypes} routes={routes} />
        </>
      )}
      <EditToolbar />
      {/* With nothing to select, undo still works (after deleting the last object). */}
      <EditorActions
        mapId={mapId}
        universeSlug={universeSlug}
        objects={objects}
        groups={groups}
        groupTypes={groupTypes}
        routes={routes}
      />
      {editing && <HistoryPanel universeId={universeId} />}
      {editing && mapSettings && (
        <Suspense fallback={null}>
          <MapSettingsPanel universeId={universeId} mapId={mapId} />
        </Suspense>
      )}
      {hasSelection && (!empty || pins.length > 0) && (
        <Suspense fallback={null}>
          <InfoPanel
            universeId={universeId}
            objects={objects}
            groups={groups}
            routes={routes}
            pins={pins}
          />
        </Suspense>
      )}
    </>
  );
}
