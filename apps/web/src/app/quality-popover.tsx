import { Settings2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { QUALITY_LEVELS, QUALITY_PRESETS, type QualityLevel } from '@/render/tuning.ts';
import { useQuality } from '@/state/quality.ts';
import { useStarField } from '@/state/star-field.ts';

const LEVEL_TEXT: Record<QualityLevel, { label: string; hint: string }> = {
  low: { label: 'Low', hint: 'For older or Intel Macs.' },
  medium: { label: 'Medium', hint: 'The default.' },
  high: { label: 'High', hint: 'Sharpest, for fast GPUs.' },
};

/**
 * The quality settings popover (rendering.md §13), remembered per browser: the quality level,
 * and how many of the galaxy's stars to draw and how bright, so labels and objects stand out
 * without lowering the quality.
 */
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
        <StarFieldControls />
      </PopoverContent>
    </Popover>
  );
}

const percent = (share: number) => `${Math.round(share * 100).toString()}%`;

/** The galaxy's stars: how many are drawn and how bright, each 0–100 % (state/star-field.ts). */
function StarFieldControls() {
  const density = useStarField((state) => state.density);
  const brightness = useStarField((state) => state.brightness);
  const setDensity = useStarField((state) => state.setDensity);
  const setBrightness = useStarField((state) => state.setBrightness);
  return (
    <fieldset className="mt-4 flex flex-col gap-2">
      <legend className="mb-2 text-xs text-muted-foreground label-caps">Galaxy stars</legend>
      <ShareSlider label="Number" value={density} onChange={setDensity} />
      <ShareSlider label="Brightness" value={brightness} onChange={setBrightness} />
    </fieldset>
  );
}

function ShareSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-20 shrink-0">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        aria-valuetext={percent(value)}
        // A range input keeps its default width (129 px) as a flex item; w-0 lets it share.
        className="w-0 min-w-0 flex-1 accent-primary"
        onChange={(event) => {
          onChange(Number(event.currentTarget.value) / 100);
        }}
      />
      <output htmlFor={id} className="w-10 shrink-0 text-right text-xs tabular-nums">
        {percent(value)}
      </output>
    </div>
  );
}
