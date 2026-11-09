import type { ViewObject } from '@ge/domain';
import { useEffect, useRef } from 'react';
import { resolveEditKey, type EditKeyAction } from '@/input/bindings.ts';
import { detectPlatform } from '@/input/platform.ts';
import { ignoresCameraKeys } from '@/input/use-keyboard.ts';
import { useContextMenu } from '@/state/context-menu.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { DeleteDialog } from './delete-dialog.tsx';
import { ObjectContextMenu } from './object-context-menu.tsx';
import { useDeleteObjects } from './use-delete-objects.ts';
import { useDuplicateObjects } from './use-duplicate-objects.ts';

/**
 * Commands on the selection in edit mode (M3-T5, ux.md §4–5), from the keyboard or the context
 * menu: ⌘/Ctrl + A selects everything in the view, ⌘/Ctrl + D duplicates, Delete or Backspace
 * deletes after a confirmation that counts what goes with it. Rendered by the map page, which
 * has the view's objects (with the versions a delete needs).
 */
export function EditorActions({
  mapId,
  objects,
}: {
  mapId: string;
  objects: readonly ViewObject[];
}) {
  const editing = useEditor((state) => state.editing);
  const selectedIds = useSelection((state) => state.selectedIds);
  const remove = useDeleteObjects();
  const duplicate = useDuplicateObjects(mapId);

  const selected = () => {
    const ids = new Set(useSelection.getState().selectedIds);
    return objects.filter((object) => ids.has(object.id));
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
        remove.request(selected());
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

  return (
    <>
      <DeleteDialog pending={remove.pending} onConfirm={remove.confirm} onCancel={remove.cancel} />
      {editing && (
        <ObjectContextMenu
          selectedCount={selectedIds.length}
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
