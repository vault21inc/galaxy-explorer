import { Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { useEditor } from '@/state/editor.ts';
import { BAR_BUTTON, BAR_TEXT } from './bar-classes.ts';

/**
 * The edit toggle (ux.md §1–2), shown on a map's page to readers who may edit. The E key does
 * the same while this is on screen.
 */
export function EditToggle() {
  const canEdit = useCanEdit();
  const editing = useEditor((state) => state.editing);
  const toggle = useEditor((state) => state.toggle);
  const setAvailable = useEditor((state) => state.setAvailable);

  useEffect(() => {
    setAvailable(canEdit);
    return () => {
      setAvailable(false);
    };
  }, [canEdit, setAvailable]);

  if (!canEdit) return null;
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
