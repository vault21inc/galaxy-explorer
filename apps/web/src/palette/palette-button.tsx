import { Search } from 'lucide-react';
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
      className="pointer-events-auto gap-1.5 text-muted-foreground"
      onClick={() => {
        usePalette.getState().setOpen(true);
      }}
    >
      <Search aria-hidden />
      Search
      <kbd className="rounded border px-1 font-sans text-[10px]">{shortcut}</kbd>
    </Button>
  );
}
