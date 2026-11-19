import { Layers } from 'lucide-react';
import { BAR_BUTTON, BAR_TEXT } from '@/app/bar-classes.ts';
import { Button } from '@/components/ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { LayersPanel } from './layers-panel.tsx';

/** The Layers panel in the top bar (M4-T5, ux.md §1): layers-panel.tsx in a popover. */
export function LayersPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`${BAR_BUTTON} gap-1.5`}
          data-tour="layers"
          title="Layers"
        >
          <Layers aria-hidden />
          <span className={BAR_TEXT}>Layers</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[70dvh] w-72 flex-col gap-3 text-sm">
        <LayersPanel />
      </PopoverContent>
    </Popover>
  );
}
