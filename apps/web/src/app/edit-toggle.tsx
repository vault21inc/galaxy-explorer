import { Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { useEditor } from '@/state/editor.ts';
import { BAR_BUTTON, BAR_TEXT } from './bar-classes.ts';

/**
 * Whether edit mode is offered on this map (ux.md §2): `useEditor`'s `available`, which the E
 * key, the shortcut help, the editor's tour and the edit toggle all read. Mounted on a map's
 * page at every width, apart from the toggle, which the slim bar doesn't show (its More sheet
 * has an Edit row instead).
 */
export function EditAvailability() {
  const canEdit = useCanEdit();
  const setAvailable = useEditor((state) => state.setAvailable);
  useEffect(() => {
    setAvailable(canEdit);
    return () => {
      setAvailable(false);
    };
  }, [canEdit, setAvailable]);
  return null;
}

/** The edit toggle (ux.md §1–2), for readers who may edit. The E key does the same. */
export function EditToggle() {
  const available = useEditor((state) => state.available);
  const editing = useEditor((state) => state.editing);
  const toggle = useEditor((state) => state.toggle);
  if (!available) return null;
  return (
    <Button
      variant={editing ? 'default' : 'ghost'}
      size="sm"
      aria-pressed={editing}
      title="Edit mode (E)"
      data-tour="edit-toggle"
      className={`${BAR_BUTTON} gap-1.5`}
      onClick={toggle}
    >
      <Pencil aria-hidden />
      <span className={BAR_TEXT}>Edit</span>
    </Button>
  );
}
