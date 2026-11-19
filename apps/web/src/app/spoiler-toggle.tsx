import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSpoilers } from '@/state/spoilers.ts';
import { BAR_BUTTON, BAR_TEXT } from './bar-classes.ts';

/**
 * "Spoilers: Hidden / Shown" (ux.md §6): reveals every potential spoiler at once, remembered
 * per browser. Shift + S does the same.
 */
export function SpoilerToggle() {
  const showAll = useSpoilers((state) => state.showAll);
  const toggle = useSpoilers((state) => state.toggle);
  // Edit mode shows every spoiler, marked; the toggle applies again when it ends.
  const editing = useEditor((state) => state.editing);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={editing || showAll}
      disabled={editing}
      data-tour="spoilers"
      title={
        editing ? 'Edit mode shows every spoiler, marked' : 'Show potential spoilers (Shift + S)'
      }
      className={`${BAR_BUTTON} gap-1.5`}
      onClick={toggle}
    >
      {editing || showAll ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
      <span className={BAR_TEXT}>Spoilers: {editing || showAll ? 'Shown' : 'Hidden'}</span>
    </Button>
  );
}
