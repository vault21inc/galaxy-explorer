import { useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog.tsx';
import { resolveGlobalKey } from '@/input/bindings.ts';
import { detectPlatform } from '@/input/platform.ts';
import { usePalette } from '@/state/palette.ts';
import { PaletteBody } from './palette-body.tsx';

/**
 * The command palette (M7-T6, ux.md §4): ⌘/Ctrl + K on any page, or the top bar's Search
 * button. It searches the universe and lists commands; choosing a result goes to it through
 * the views.
 */
export function CommandPalette() {
  const open = usePalette((state) => state.open);
  const setOpen = usePalette((state) => state.setOpen);

  useEffect(() => {
    const platform = detectPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (resolveGlobalKey(event, platform) !== 'open-palette') return;
      // The browser's own ⌘K (the address bar's search, in some) gives way.
      event.preventDefault();
      usePalette.getState().setOpen(!usePalette.getState().open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && (
        <DialogContent className="top-24 translate-y-0 gap-0 p-0 sm:max-w-xl" data-keys="own">
          <DialogTitle className="sr-only">Search and commands</DialogTitle>
          <PaletteBody
            onDone={() => {
              setOpen(false);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
