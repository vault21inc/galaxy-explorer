import { Settings2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { QUALITY_LEVELS, QUALITY_PRESETS, type QualityLevel } from '@/render/tuning.ts';
import { useQuality } from '@/state/quality.ts';

const LEVEL_TEXT: Record<QualityLevel, { label: string; hint: string }> = {
  low: { label: 'Low', hint: 'For older or Intel Macs.' },
  medium: { label: 'Medium', hint: 'The default.' },
  high: { label: 'High', hint: 'Sharpest, for fast GPUs.' },
};

/** The quality settings popover (rendering.md §13), remembered per browser. */
export function QualityPopover() {
  const id = useId();
  const level = useQuality((state) => state.level);
  const setLevel = useQuality((state) => state.setLevel);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Quality settings"
          className="pointer-events-auto"
        >
          <Settings2 aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 text-sm">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs text-muted-foreground label-caps">Quality</legend>
          {QUALITY_LEVELS.map((option) => (
            <label key={option} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name={`${id}-quality`}
                value={option}
                checked={level === option}
                onChange={() => {
                  setLevel(option);
                }}
                className="mt-1 accent-primary"
              />
              <span>
                {LEVEL_TEXT[option].label}
                <span className="block text-xs text-muted-foreground">
                  {LEVEL_TEXT[option].hint} Up to {QUALITY_PRESETS[option].dprRange[1]}× pixels.
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-xs text-muted-foreground">
          Antialiasing changes apply when the page next loads.
        </p>
      </PopoverContent>
    </Popover>
  );
}
