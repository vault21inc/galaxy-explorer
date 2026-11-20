import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import type { DetailsStop } from '@/state/details-sheet.ts';

/**
 * The top of the details panel: its handle, the card when that's all it shows, and the
 * buttons that change its height or close it (docs/plan/later/phone-usability.md, "The details
 * sheet's three stops").
 *
 * As a sheet along the bottom of a phone, the whole strip is the handle (`drag`), and its
 * buttons do what a drag does, for those who can't drag: up is taller, down is shorter. The
 * side panel has two states and no handle; its arrow points the way the panel will go, down
 * to open, as it hangs from the top.
 */
export function DetailsStrip({
  stop,
  sheet,
  drag,
  onStop,
  onClose,
  children,
}: {
  /** The stop the panel shows now. */
  stop: DetailsStop;
  sheet: boolean;
  /** Pointer handlers from `useDetailsDrag`. */
  drag: HTMLAttributes<HTMLDivElement>;
  onStop: (stop: DetailsStop) => void;
  onClose: () => void;
  /** The card, at `card`. */
  children?: ReactNode;
}) {
  const taller: DetailsStop | null = stop === 'card' ? 'half' : stop === 'half' ? 'full' : null;
  const shorter: DetailsStop | null = stop === 'full' ? 'half' : stop === 'half' ? 'card' : null;
  // The side panel only opens and collapses.
  const expandTo = sheet ? taller : stop === 'card' ? 'half' : null;
  return (
    <div
      {...drag}
      data-testid="details-strip"
      className={cn('shrink-0', sheet && 'cursor-grab touch-none', stop !== 'card' && 'border-b')}
    >
      {sheet && (
        <div aria-hidden className="flex h-4 items-end justify-center">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/50" />
        </div>
      )}
      <div className="flex items-start justify-end gap-1 px-2 py-1">
        {children}
        {expandTo && (
          <Button
            variant="ghost"
            size={sheet ? 'icon-lg' : 'icon-sm'}
            aria-label="Expand details"
            aria-expanded={stop !== 'card'}
            onClick={() => {
              onStop(expandTo);
            }}
          >
            {sheet ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
        )}
        {shorter && (
          <Button
            variant="ghost"
            size={sheet ? 'icon-lg' : 'icon-sm'}
            aria-label="Collapse details"
            aria-expanded
            onClick={() => {
              onStop(shorter);
            }}
          >
            {sheet ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
          </Button>
        )}
        <Button
          variant="ghost"
          size={sheet ? 'icon-lg' : 'icon-sm'}
          aria-label="Close details"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
