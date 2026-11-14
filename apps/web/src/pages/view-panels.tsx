import type { ViewLocated, ViewGroup, ViewGroupType, ViewObject, ViewRoute } from '@ge/domain';
import { lazy, Suspense, useMemo } from 'react';
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
  /**
   * A system or orbit view's subject: the system or world itself. It's the outliner's first
   * row, and in the orbit view a click on the globe selects it, so its details and form open
   * here too. The editor's commands leave it out: they act on what's in the view.
   */
  subject?: ViewObject;
  groups?: readonly ViewGroup[];
  groupTypes?: readonly ViewGroupType[];
  routes?: readonly ViewRoute[];
  /** The view's places and events: an orbit view's pins (M6-T4), or event markers (M6-T5). */
  pins?: readonly ViewLocated[];
  /** The Map settings panel belongs to this view (levels/registry.ts). */
  mapSettings: boolean;
  /** What an empty view says (levels/registry.ts `emptyTitle`). */
  emptyTitle: string;
}

/** What an empty view suggests, under its title. */
const EMPTY_HINT = 'Add objects in edit mode (E) with the toolbar’s Add button, or press N.';

/**
 * The page's panels over any view that can be edited (M5-T4): the outliner, the edit toolbar
 * and its commands, History, Map settings where they belong, and the info panel. The galaxy,
 * system and orbit views all use it, with their own objects. An empty galaxy view says so
 * instead of offering the outliner; an empty system or orbit view says so in the outliner,
 * under its subject.
 */
export function ViewPanels({
  universeId,
  universeSlug,
  mapId,
  objects,
  subject,
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
  // What the announcer and the info panel can name: the view's objects and its subject.
  const named = useMemo(() => (subject ? [subject, ...objects] : objects), [subject, objects]);
  return (
    <>
      {empty && !subject ? (
        <StatusPanel tone="empty" title={emptyTitle}>
          {EMPTY_HINT}
        </StatusPanel>
      ) : (
        <>
          <SelectionAnnouncer objects={named} />
          <OutlinerSlot
            universeId={universeId}
            objects={objects}
            groups={groups}
            groupTypes={groupTypes}
            routes={routes}
            subject={subject ?? null}
            emptyNote={empty ? { title: emptyTitle, hint: EMPTY_HINT } : null}
          />
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
        pins={pins}
      />
      {editing && <HistoryPanel universeId={universeId} />}
      {editing && mapSettings && (
        <Suspense fallback={null}>
          <MapSettingsPanel universeId={universeId} mapId={mapId} />
        </Suspense>
      )}
      {hasSelection && (!empty || pins.length > 0 || subject) && (
        <Suspense fallback={null}>
          <InfoPanel
            universeId={universeId}
            objects={named}
            groups={groups}
            routes={routes}
            pins={pins}
          />
        </Suspense>
      )}
    </>
  );
}
