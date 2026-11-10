import type { ViewGroup, ViewGroupType } from '@ge/domain';
import { useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { detectPlatform } from '@/input/platform.ts';
import { useContextMenu } from '@/state/context-menu.ts';

/**
 * The context menu on a right-click on an object in edit mode (ux.md §3, M3-T5). It acts on the
 * selection, which the click has just set. "Enter" arrives with the system view (M5). The
 * group commands (M4-T2): Group… opens the dialog, "Add to group ▸" lists the map's groups by
 * type, and "Remove from group" takes the selection out of its group in the active layer.
 */
export function ObjectContextMenu({
  selectedCount,
  groups,
  groupTypes,
  removeLabel,
  canRemove,
  onRename,
  onGroup,
  onAddTo,
  onRemove,
  onDuplicate,
  onDelete,
}: {
  selectedCount: number;
  groups: readonly ViewGroup[];
  groupTypes: readonly ViewGroupType[];
  removeLabel: string;
  canRemove: boolean;
  onRename: () => void;
  onGroup: () => void;
  onAddTo: (group: ViewGroup) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const at = useContextMenu((state) => state.at);
  const close = useContextMenu((state) => state.close);
  const primary = detectPlatform() === 'mac' ? '⌘' : 'Ctrl+';
  const shift = detectPlatform() === 'mac' ? '⇧' : 'Shift+';
  // The groups under their type's name, in settings order.
  const byType = groupTypes
    .toSorted((a, b) => a.sortKey - b.sortKey)
    .map((type) => ({
      type,
      groups: groups
        .filter((group) => group.groupTypeId === type.id)
        .toSorted((a, b) => a.namePlain.localeCompare(b.namePlain)),
    }))
    .filter((entry) => entry.groups.length > 0);
  // Rename moves focus to the name field, which the menu's focus trap would take back while
  // the menu is still open; so it runs once the menu has closed.
  const afterClose = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu
      open={at !== null && selectedCount > 0}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {/* An invisible anchor where the pointer was, for the menu to open from. */}
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: at?.x ?? 0, top: at?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-44"
        aria-label="Object actions"
        // Focus doesn't return to the invisible anchor; a pending Rename takes it instead.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          afterClose.current?.();
          afterClose.current = null;
        }}
      >
        <DropdownMenuItem
          disabled={selectedCount !== 1}
          onSelect={() => {
            afterClose.current = onRename;
          }}
        >
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            // The dialog takes focus, which the closing menu would take back.
            afterClose.current = onGroup;
          }}
        >
          Group…
          <DropdownMenuShortcut>{primary}G</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={byType.length === 0}>
            Add to group
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 min-w-44 overflow-y-auto">
            {byType.map(({ type, groups: ofType }) => (
              <div key={type.id} role="group" aria-label={type.name}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {type.name}
                </DropdownMenuLabel>
                {ofType.map((group) => (
                  <DropdownMenuItem
                    key={group.id}
                    onSelect={() => {
                      onAddTo(group);
                    }}
                  >
                    {group.namePlain}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={!canRemove} onSelect={onRemove}>
          {removeLabel}
          <DropdownMenuShortcut>
            {shift}
            {primary}G
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDuplicate}>
          Duplicate
          <DropdownMenuShortcut>{primary}D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
