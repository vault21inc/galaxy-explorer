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
import { useConfigList } from '@/api/hooks.ts';
import { levels } from '@/levels/registry.ts';
import { useEditView } from '@/levels/use-edit-view.ts';
import { useEditor } from '@/state/editor.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { useGroupDialog } from '@/state/group-dialog.ts';
import { useRouteDraft } from '@/state/route-draft.ts';
import { useSelection } from '@/state/selection.ts';
import { useSidePanel } from '@/state/side-panel.ts';
import { AddMenu } from './add-menu.tsx';
import { useUndoRedo } from './use-undo.ts';

interface Tool {
  label: string;
  icon: LucideIcon;
  /** The task that brings it; until then the button is shown but disabled. */
  arrives?: string;
  active?: boolean;
  /** Its shortcut, for the tooltip. */
  keys?: string;
}

/** The toolbar's items in ux.md §1's order. */
const TOOLS: readonly Tool[] = [
  { label: 'Select', icon: MousePointer2, active: true },
  { label: 'Group', icon: Group, keys: '⌘/Ctrl + G' },
  { label: 'Route', icon: Route },
  { label: 'Map', icon: MapIcon },
  { label: 'Undo', icon: Undo2, keys: '⌘/Ctrl + Z' },
  { label: 'Redo', icon: Redo2, keys: '⌘/Ctrl + Shift + Z' },
  { label: 'History', icon: History },
];

/**
 * The edit toolbar (ux.md §1), at the bottom in edit mode only. M3's later tasks bring the
 * other tools to life; they're shown now, disabled, so the layout doesn't shift as they arrive.
 */
export function EditToolbar() {
  const editing = useEditor((state) => state.editing);
  const placing = useEditor((state) => state.placing);
  const placingSubtypeId = useEditor((state) => state.placingSubtypeId);
  const placingLocated = useEditor((state) => state.placingLocated);
  const universeId = useEditView()?.payload?.map.universeId;
  const placingSubtype = useConfigList('object_subtypes', universeId).data?.find(
    (subtype) => subtype.id === placingSubtypeId,
  );
  const routing = useEditor((state) => state.routing);
  const stops = useRouteDraft((state) => state.waypoints.length);
  // The view being edited: its grid, and which tools belong in it (levels/registry.ts).
  const level = useNavigation(topView)?.level ?? 'galaxy';
  const edit = levels[level].edit;
  const gridSize = useEditor((state) => state.gridSizes[level] ?? edit?.gridSize ?? 1);
  const setGridSize = useEditor((state) => state.setGridSize);
  const history = useUndoRedo();
  const leftPanel = useSidePanel((state) => state.left);
  const hasSelection = useSelection((state) => state.selectedIds.length > 0);
  if (!editing) return null;

  /** Groups and routes are galaxy-view tools (M4): elsewhere they're shown, disabled. */
  const elsewhere = { disabled: true, why: 'Groups and routes are drawn in the galaxy view' };
  /** What the working tools do; the others are placeholders until their task. */
  const behaviour = (
    label: string,
  ): { onClick?: () => void; disabled?: boolean; pressed?: boolean; why?: string } => {
    switch (label) {
      case 'Group':
        // The dialog groups the selected objects (M4-T2).
        if (!edit?.groupsAndRoutes) return elsewhere;
        return { onClick: useGroupDialog.getState().show, disabled: !hasSelection };
      case 'Route':
        // Click objects in order (M4-T7); the tool's keys are in its status line.
        if (!edit?.groupsAndRoutes) return elsewhere;
        return {
          onClick: () => {
            const editor = useEditor.getState();
            if (editor.routing) editor.stopRouting();
            else editor.startRouting();
          },
          pressed: routing,
        };
      case 'Undo':
        return { onClick: history.undo, disabled: !history.canUndo };
      case 'Redo':
        return { onClick: history.redo, disabled: !history.canRedo };
      case 'History':
        return {
          onClick: () => {
            useSidePanel.getState().toggle('history');
          },
          pressed: leftPanel === 'history',
        };
      case 'Map':
        if (!edit?.mapSettings)
          return { disabled: true, why: 'Map settings are in the galaxy view' };
        return {
          onClick: () => {
            useSidePanel.getState().toggle('map-settings');
          },
          pressed: leftPanel === 'map-settings',
        };
      default:
        return {};
    }
  };
  return (
    <div
      role="toolbar"
      aria-label="Edit tools"
      data-tour="edit-toolbar"
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-card p-1"
    >
      {TOOLS.map(({ label, icon: Icon, arrives, active, keys }) => {
        const { onClick, disabled = false, pressed, why } = behaviour(label);
        const on = (active === true && !placing && !placingLocated && !routing) || pressed === true;
        return (
          <span key={label} className="contents">
            <Button
              variant={on ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={active || pressed !== undefined ? on : undefined}
              disabled={arrives !== undefined || disabled}
              title={
                why ??
                (arrives ? `${label}: arrives in ${arrives}` : keys ? `${label} (${keys})` : label)
              }
              className="gap-1.5"
              data-tour={`tool-${label.toLowerCase()}`}
              onClick={onClick}
            >
              <Icon aria-hidden />
              {label}
            </Button>
            {label === 'Select' && <AddMenu />}
          </span>
        );
      })}
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
          // Keyed by the view, so entering another view shows its own grid.
          key={level}
          defaultValue={gridSize}
          className="w-16 rounded-md border border-input bg-transparent px-1.5 py-0.5 text-foreground"
          onChange={(event) => {
            setGridSize(level, Number(event.currentTarget.value));
          }}
        />
      </label>
      {routing && (
        <p role="status" className="px-2 text-xs whitespace-nowrap text-muted-foreground">
          {stops === 0
            ? 'Click objects in order'
            : `${stops.toString()} ${stops === 1 ? 'stop' : 'stops'}`}
          {' · ⌫ removes last · '}
          {stops >= 2 ? 'Enter finishes · ' : ''}Esc cancels
        </p>
      )}
      {placing && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          Click to place a {placingSubtype?.name ?? objectTypes[placing].label.toLowerCase()} · Esc
          cancels
        </p>
      )}
      {placingLocated && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {edit?.located.mode === 'surface'
            ? `Click the globe to place the ${placingLocated}`
            : `Click to place the ${placingLocated}`}{' '}
          · Esc cancels
        </p>
      )}
    </div>
  );
}
