import { CircleHelp } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { BAR_BUTTON } from '@/app/bar-classes.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { SHEET_ROW } from '@/components/ui/sheet.tsx';
import { useCanCreate } from '@/editor/use-can-edit.ts';
import { useHelp } from '@/state/help.ts';
import { useSheet } from '@/state/sheet.ts';
import { useStartEditorTour } from './practice.ts';
import { useTour } from './tour-store.ts';
import { TOURS } from './tours.ts';

/** One thing the Help menu offers, rendered as a menu item or as a sheet's row. */
interface HelpItem {
  key: string;
  label: string;
  /** A short note at the row's end: the key that does it, or why it's unavailable. */
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

/**
 * What Help offers (M8-T10, ux.md §12): the shortcuts and gestures (M4-T9, also `?`), the
 * reader's tour on the map that's open, and the editor tour for anyone who may make universes.
 * The About pages (M8-T9) follow as a link. One list for the top bar's menu and the slim bar's
 * Help sheet.
 */
function useHelpItems(): HelpItem[] {
  const { mapSlug } = useParams();
  const canCreate = useCanCreate();
  const startEditor = useStartEditorTour();
  return [
    {
      key: 'shortcuts',
      label: 'Keyboard shortcuts',
      hint: '?',
      run: () => {
        useHelp.getState().setOpen(true);
      },
    },
    {
      key: 'reader-tour',
      label: TOURS.reader.title,
      hint: mapSlug === undefined ? 'open a map' : undefined,
      disabled: mapSlug === undefined,
      run: () => {
        useTour.getState().start('reader');
      },
    },
    ...(canCreate
      ? [
          {
            key: 'editor-tour',
            label: TOURS.editor.title,
            disabled: startEditor.isPending,
            run: () => {
              startEditor.mutate();
            },
          },
        ]
      : []),
  ];
}

/** The top bar's Help menu. */
export function HelpMenu() {
  const items = useHelpItems();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Help"
          title="Help"
          className={`${BAR_BUTTON} compact:coarse:size-10`}
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
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={() => {
              // Once the menu has closed and put focus back on this button, so that closing
              // what it opens (the shortcuts) returns focus here.
              window.setTimeout(item.run, 0);
            }}
          >
            {item.label}
            {item.hint && <kbd className="ml-auto text-xs text-muted-foreground">{item.hint}</kbd>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/about/attributions">About this site</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The slim bar's Help sheet: the same items as rows. Each closes the sheet first. */
export function HelpRows() {
  const items = useHelpItems();
  const close = useSheet((state) => state.close);
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={SHEET_ROW}
          disabled={item.disabled}
          onClick={() => {
            close();
            item.run();
          }}
        >
          <span className="flex-1">{item.label}</span>
          {item.hint && item.hint !== '?' && (
            <span className="text-xs text-muted-foreground">{item.hint}</span>
          )}
        </button>
      ))}
      <Link to="/about/attributions" className={SHEET_ROW} onClick={close}>
        About this site
      </Link>
    </div>
  );
}
