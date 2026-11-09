import {
  Group,
  History,
  Map as MapIcon,
  MousePointer2,
  Redo2,
  Route,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { objectTypes } from '@ge/domain';
import { useEditor } from '@/state/editor.ts';
import { AddMenu } from './add-menu.tsx';

interface Tool {
  label: string;
  icon: LucideIcon;
  /** The task that brings it; until then the button is shown but disabled. */
  arrives?: string;
  active?: boolean;
}

/** The toolbar's items in ux.md §1's order. */
const TOOLS: readonly Tool[] = [
  { label: 'Select', icon: MousePointer2, active: true },
  { label: 'Group', icon: Group, arrives: 'M4' },
  { label: 'Route', icon: Route, arrives: 'M4' },
  { label: 'Map', icon: MapIcon, arrives: 'M3-T8' },
  { label: 'Undo', icon: Undo2, arrives: 'M3-T6' },
  { label: 'Redo', icon: Redo2, arrives: 'M3-T6' },
  { label: 'History', icon: History, arrives: 'M3-T6' },
];

/**
 * The edit toolbar (ux.md §1), at the bottom in edit mode only. M3's later tasks bring the
 * other tools to life; they're shown now, disabled, so the layout doesn't shift as they arrive.
 */
export function EditToolbar() {
  const editing = useEditor((state) => state.editing);
  const placing = useEditor((state) => state.placing);
  const gridSize = useEditor((state) => state.gridSize);
  const setGridSize = useEditor((state) => state.setGridSize);
  if (!editing) return null;
  return (
    <div
      role="toolbar"
      aria-label="Edit tools"
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-card p-1"
    >
      {TOOLS.map(({ label, icon: Icon, arrives, active }) => (
        <span key={label} className="contents">
          <Button
            variant={active && !placing ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={active ? !placing : undefined}
            disabled={arrives !== undefined}
            title={arrives ? `${label}: arrives in ${arrives}` : label}
            className="gap-1.5"
          >
            <Icon aria-hidden />
            {label}
          </Button>
          {label === 'Select' && <AddMenu />}
        </span>
      ))}
      <label
        className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground"
        title="Hold Shift while dragging to snap to this grid"
      >
        Grid
        <input
          type="number"
          min={0}
          step="any"
          aria-label="Grid size"
          defaultValue={gridSize}
          className="w-16 rounded-md border border-input bg-transparent px-1.5 py-0.5 text-foreground"
          onChange={(event) => {
            setGridSize(Number(event.currentTarget.value));
          }}
        />
      </label>
      {placing && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          Click to place a {objectTypes[placing].label.toLowerCase()} · Esc cancels
        </p>
      )}
    </div>
  );
}
