import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { useSpoilers } from '@/state/spoilers.ts';

/**
 * "Spoilers: Hidden / Shown" (ux.md §6): reveals every potential spoiler at once, remembered
 * per browser. Shift + S does the same.
 */
export function SpoilerToggle() {
  const showAll = useSpoilers((state) => state.showAll);
  const toggle = useSpoilers((state) => state.toggle);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={showAll}
      title="Show potential spoilers (Shift + S)"
      className="pointer-events-auto gap-1.5"
      onClick={toggle}
    >
      {showAll ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
      Spoilers: {showAll ? 'Shown' : 'Hidden'}
    </Button>
  );
}
