import { Search } from 'lucide-react';
import { BAR_BUTTON, BAR_TEXT } from '@/app/bar-classes.ts';
import { Button } from '@/components/ui/button.tsx';
import { detectPlatform } from '@/input/platform.ts';
import { usePalette } from '@/state/palette.ts';

/** The top bar's way into the command palette (M7-T6), showing its shortcut. */
export function PaletteButton() {
  const shortcut = detectPlatform() === 'mac' ? '⌘K' : 'Ctrl K';
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`${BAR_BUTTON} gap-1.5 text-muted-foreground`}
      data-tour="search"
      title={`Search (${shortcut})`}
      onClick={() => {
        usePalette.getState().setOpen(true);
      }}
    >
      <Search aria-hidden />
      <span className={BAR_TEXT}>Search</span>
      <kbd className="rounded border px-1 font-sans text-[10px] compact:hidden slim:hidden">
        {shortcut}
      </kbd>
    </Button>
  );
}
