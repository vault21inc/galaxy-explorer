import { ICON_CREDITS, ICON_SETS } from '@ge/domain';
import { X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { detectPlatform } from '@/input/platform.ts';
import { useEditor } from '@/state/editor.ts';
import { useHelp } from '@/state/help.ts';
import { helpSections } from './help-sections.ts';

/**
 * The shortcut help (M4-T9, ux.md §12): every key and gesture that works here, generated from
 * the binding tables (help-sections.ts). `?` opens it, and so does the Help menu
 * (help/help-menu.tsx). It's a Radix dialog, so Esc closes it and focus returns to where it was.
 */
export function ShortcutHelp() {
  const open = useHelp((state) => state.open);
  const setOpen = useHelp((state) => state.setOpen);
  const editing = useEditor((state) => state.editing);
  const canEdit = useEditor((state) => state.available);
  // Where focus was when the panel opened, to return it there. Radix returns focus to a
  // DialogTrigger, which this dialog has none of: `?` opens it from anywhere.
  const returnTo = useRef<HTMLElement | null>(null);
  const sections = useMemo(
    () => helpSections({ platform: detectPlatform(), editing, canEdit }),
    [editing, canEdit],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
          onOpenAutoFocus={() => {
            // Runs before focus moves into the panel.
            returnTo.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnTo.current?.focus();
            returnTo.current = null;
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <DialogHeader>
              <DialogTitle>Keyboard shortcuts</DialogTitle>
              <DialogDescription>
                Keys are ignored while you type in a text field.
              </DialogDescription>
            </DialogHeader>
            {/* Also gives the scrolling panel something to focus, so the keyboard can scroll it. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={() => {
                setOpen(false);
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {sections.map((section) => (
              <section
                key={section.id}
                aria-labelledby={`help-${section.id}`}
                // Gestures have several ways each: they get the full width.
                className={section.id === 'pointer' ? 'sm:col-span-2' : undefined}
              >
                <h3
                  id={`help-${section.id}`}
                  className="mb-2 text-xs text-muted-foreground label-caps"
                >
                  {section.title}
                </h3>
                <dl className="flex flex-col gap-1.5 text-sm">
                  {section.rows.map((row) => (
                    <div
                      key={row.description}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt>{row.description}</dt>
                      <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                        {row.keys.map((keys) => (
                          <kbd
                            key={keys}
                            className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs whitespace-nowrap text-foreground"
                          >
                            {keys}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          {/* game-icons.net's licence (CC BY 3.0) asks for this credit (D-32). */}
          <footer className="border-t pt-3 text-xs text-muted-foreground">
            Icons:{' '}
            {ICON_SETS.map((set, index) => (
              <span key={set}>
                {index > 0 && '; '}
                <a
                  href={ICON_CREDITS[set].url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {ICON_CREDITS[set].text}
                </a>
              </span>
            ))}
            .
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
