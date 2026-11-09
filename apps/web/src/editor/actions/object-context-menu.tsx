import { useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { detectPlatform } from '@/input/platform.ts';
import { useContextMenu } from '@/state/context-menu.ts';

/**
 * The context menu on a right-click on an object in edit mode (ux.md §3, M3-T5). It acts on the
 * selection, which the click has just set. "Enter" arrives with the system view (M5) and
 * "Add to group ▸" with groups (M4).
 */
export function ObjectContextMenu({
  selectedCount,
  onRename,
  onDuplicate,
  onDelete,
}: {
  selectedCount: number;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const at = useContextMenu((state) => state.at);
  const close = useContextMenu((state) => state.close);
  const primary = detectPlatform() === 'mac' ? '⌘' : 'Ctrl+';
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
