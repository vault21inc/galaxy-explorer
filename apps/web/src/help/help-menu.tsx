import { CircleHelp } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { useCanCreate } from '@/editor/use-can-edit.ts';
import { useHelp } from '@/state/help.ts';
import { useStartEditorTour } from './practice.ts';
import { useTour } from './tour-store.ts';
import { TOURS } from './tours.ts';

/**
 * The top bar's Help menu (M8-T10, ux.md §12): the keyboard shortcuts (M4-T9, also `?`), the
 * reader's tour on the map that's open, the editor tour for anyone who may make universes, and
 * the About pages (M8-T9).
 */
export function HelpMenu() {
  const { mapSlug } = useParams();
  const canCreate = useCanCreate();
  const startEditor = useStartEditorTour();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Help"
          title="Help"
          className="pointer-events-auto"
          data-tour="help"
        >
          <CircleHelp aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-52"
        onCloseAutoFocus={(event) => {
          // A tour started from here: focus goes to its first step, not back to this button.
          if (!useTour.getState().active) return;
          event.preventDefault();
          document.querySelector<HTMLElement>('[data-tour-step]')?.focus();
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            // Once the menu has closed and put focus back on this button, so that closing the
            // shortcuts returns it here.
            window.setTimeout(() => {
              useHelp.getState().setOpen(true);
            }, 0);
          }}
        >
          Keyboard shortcuts
          <kbd className="ml-auto text-xs text-muted-foreground">?</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={mapSlug === undefined}
          onSelect={() => {
            useTour.getState().start('reader');
          }}
        >
          {TOURS.reader.title}
          {mapSlug === undefined && (
            <span className="ml-auto text-xs text-muted-foreground">open a map</span>
          )}
        </DropdownMenuItem>
        {canCreate && (
          <DropdownMenuItem
            disabled={startEditor.isPending}
            onSelect={() => {
              startEditor.mutate();
            }}
          >
            {TOURS.editor.title}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/about/attributions">About this site</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
