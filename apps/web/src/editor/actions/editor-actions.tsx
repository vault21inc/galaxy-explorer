import type { ViewGroup, ViewGroupType, ViewObject, ViewRoute } from '@ge/domain';
import { useEffect, useRef } from 'react';
import { resolveEditKey, type EditKeyAction } from '@/input/bindings.ts';
import { detectPlatform } from '@/input/platform.ts';
import { ignoresCameraKeys } from '@/input/use-keyboard.ts';
import { GroupDialog } from '@/panels/group-dialog/group-dialog.tsx';
import { useContextMenu } from '@/state/context-menu.ts';
import { useGroupDialog } from '@/state/group-dialog.ts';
import { useLayers } from '@/state/layers.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useUndoRedo } from '../use-undo.ts';
import { DeleteDialog } from './delete-dialog.tsx';
import { activeLayerOf, removeFromGroupsRequest } from './group.ts';
import { ObjectContextMenu } from './object-context-menu.tsx';
import { useCreateRoute } from './use-create-route.ts';
import { useDeleteObjects } from './use-delete-objects.ts';
import { useDuplicateObjects } from './use-duplicate-objects.ts';
import { useGroupActions } from './use-group-actions.ts';

/**
 * Commands in edit mode (ux.md §4–5), from the keyboard or the context menu: ⌘/Ctrl + A
 * selects everything in the view, ⌘/Ctrl + D duplicates, Delete or Backspace deletes after a
 * confirmation that counts what goes with it (M3-T5); ⌘/Ctrl + Z undoes and ⌘/Ctrl + Shift + Z
 * (or Ctrl + Y) redoes (M3-T6). ⌘/Ctrl + G groups the selection in a dialog, and
 * ⌘/Ctrl + Shift + G takes it out of its group in the active layer (M4-T2). "Create route"
 * draws a route through the selected objects in the order they were selected (M4-T7). In a text field
 * these keys are the field's own. Rendered by the map page, which has the view's objects and
 * groups (with the versions a delete needs).
 */
export function EditorActions({
  mapId,
  universeSlug,
  objects,
  groups = [],
  groupTypes = [],
  routes = [],
}: {
  mapId: string;
  universeSlug: string;
  objects: readonly ViewObject[];
  groups?: readonly ViewGroup[];
  groupTypes?: readonly ViewGroupType[];
  routes?: readonly ViewRoute[];
}) {
  const editing = useEditor((state) => state.editing);
  const selectedIds = useSelection((state) => state.selectedIds);
  const remove = useDeleteObjects();
  const duplicate = useDuplicateObjects(mapId);
  const history = useUndoRedo();
  const groupActions = useGroupActions(groups, groupTypes);
  const createRoute = useCreateRoute(mapId, objects);
  const activeLayer = useLayers((state) => state.activeLayer);

  const selected = () => {
    const ids = new Set(useSelection.getState().selectedIds);
    return objects.filter((object) => ids.has(object.id));
  };
  const selectedGroups = () => {
    const ids = new Set(useSelection.getState().selectedIds);
    return groups.filter((group) => ids.has(group.id));
  };
  const selectedRoutes = () => {
    const ids = new Set(useSelection.getState().selectedIds);
    return routes.filter((route) => ids.has(route.id));
  };
  const selectedObjectIds = () => selected().map((object) => object.id);
  /** The selected objects in the order they were selected, for a route through them. */
  const selectionOrder = () => {
    const ids = new Set(objects.map((object) => object.id as string));
    return useSelection.getState().selectedIds.filter((id) => ids.has(id));
  };
  const perform = (action: EditKeyAction) => {
    switch (action) {
      case 'select-all':
        useSelection.getState().select(objects.map((object) => object.id));
        return;
      case 'duplicate':
        if (selected().length > 0 && !duplicate.isPending) duplicate.mutate(selected());
        return;
      case 'delete':
        remove.request([
          ...selected(),
          ...selectedGroups().map((group) => ({ ...group, kind: 'group' as const })),
          ...selectedRoutes().map((route) => ({ ...route, kind: 'route' as const })),
        ]);
        return;
      case 'group':
        if (selected().length > 0) useGroupDialog.getState().show();
        return;
      case 'ungroup':
        groupActions.removeFromLayer(selectedObjectIds()).catch(() => undefined);
        return;
      case 'undo':
        history.undo();
        return;
      case 'redo':
        history.redo();
        return;
    }
  };

  // The listener is added once; it calls the latest `perform` (with the latest objects).
  const performRef = useRef(perform);
  useEffect(() => {
    performRef.current = perform;
  });
  useEffect(() => {
    if (!editing) return;
    const platform = detectPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || ignoresCameraKeys(event.target)) return;
      const action = resolveEditKey(event, platform);
      if (!action) return;
      // ⌘A would select the page's text and ⌘D bookmark it; Backspace once meant "back".
      event.preventDefault();
      performRef.current(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editing]);

  // Leaving edit mode closes the menu.
  useEffect(() => {
    if (!editing) useContextMenu.getState().close();
  }, [editing]);

  // "Remove from group" is offered when the selection is in a group of the active layer.
  const layer = activeLayerOf(activeLayer, groupTypes);
  const selectedIdList = objects.filter((object) => selectedIds.includes(object.id));
  const canRemove =
    layer !== null &&
    removeFromGroupsRequest(
      selectedIdList.map((object) => object.id),
      layer,
      groups,
      groupTypes,
    ) !== null;

  return (
    <>
      <DeleteDialog pending={remove.pending} onConfirm={remove.confirm} onCancel={remove.cancel} />
      {editing && (
        <GroupDialog
          mapId={mapId}
          universeSlug={universeSlug}
          objectIds={selectedIdList.map((object) => object.id)}
          groups={groups}
          groupTypes={groupTypes}
        />
      )}
      {editing && (
        <ObjectContextMenu
          selectedCount={selectedIds.length}
          groups={groups}
          groupTypes={groupTypes}
          removeLabel={layer ? `Remove from ${layer.toLowerCase()} group` : 'Remove from group'}
          canRemove={canRemove}
          canRoute={selectedIdList.length >= 2}
          onCreateRoute={() => {
            void createRoute(selectionOrder());
          }}
          onGroup={() => {
            perform('group');
          }}
          onAddTo={(group) => {
            groupActions.addTo(group, selectedObjectIds()).catch(() => undefined);
          }}
          onRemove={() => {
            perform('ungroup');
          }}
          onRename={() => {
            const [id] = useSelection.getState().selectedIds;
            // The panel's name field takes focus and selects its text (as after creating).
            if (id) useEditor.getState().setFocusNameOf(id);
          }}
          onDuplicate={() => {
            perform('duplicate');
          }}
          onDelete={() => {
            perform('delete');
          }}
        />
      )}
    </>
  );
}
