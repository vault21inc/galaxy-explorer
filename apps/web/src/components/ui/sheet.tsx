import { ArrowLeft, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils';
import { CLOSE_PULL_PX } from './sheet-drag.ts';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A way back to the sheet this one was opened from (More), shown as an arrow. */
  onBack?: () => void;
  /** The tour's name for the sheet (`data-tour`). */
  tourName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A panel that rises from the bottom of the window, as wide as it, for the slim tier
 * (docs/plan/later/phone-usability.md, "Sheets"). In a short window (a phone on its side) it
 * comes from the right instead, the full height. It clears the notch and the home bar.
 *
 * Built on Radix's dialog, so Esc closes it and focus moves in when it opens and back when it
 * closes. It's not modal, as the popovers it stands in for aren't: the map stays live behind
 * it, a tap there closes it, and a guided tour's step can still be used while it's open.
 */
export function Sheet({ open, onClose, title, onBack, tourName, className, children }: SheetProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-slot="sheet"
          data-tour={tourName}
          className={cn(
            // From the bottom: the window's width, at most 85 % of its height.
            'fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-xl border-t bg-card-solid text-sm shadow-lg outline-none',
            'pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
            // From the right, in a window under 500 px high.
            'short:inset-x-auto short:top-0 short:right-0 short:max-h-none short:w-[min(360px,60vw)] short:rounded-t-none short:rounded-l-xl short:border-t-0 short:border-l short:pt-[env(safe-area-inset-top)] short:pl-0',
            className,
          )}
          onInteractOutside={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            // A guided tour's step stays usable over an open sheet (help/tour-popover.tsx).
            // The top bar's controls decide for themselves: each opens its own sheet in this
            // one's place, or closes it. On touch, Radix dismisses after the tap's click, so
            // letting it dismiss here would close the sheet the tap had just opened.
            if (target.closest('[data-tour-step], header')) event.preventDefault();
          }}
        >
          <GrabBar onClose={onClose} />
          <div className="flex items-center gap-1 px-2 pb-1">
            {onBack && (
              <Button variant="ghost" size="icon-lg" aria-label="Back" onClick={onBack}>
                <ArrowLeft aria-hidden />
              </Button>
            )}
            <DialogPrimitive.Title className={cn('flex-1 font-medium', !onBack && 'pl-2')}>
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-lg" aria-label="Close">
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The bar at a bottom sheet's top edge: pulling it down closes the sheet, as on a phone's
 * own sheets. Only the bar, so scrolling the sheet's contents never closes it. Not shown when
 * the sheet comes from the right.
 */
function GrabBar({ onClose }: { onClose: () => void }) {
  const start = useRef<{ y: number; sheet: HTMLElement } | null>(null);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const pull = Math.max(0, event.clientY - start.current.y);
    start.current.sheet.style.transform = `translateY(${String(pull)}px)`;
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const pulled = event.clientY - start.current.y >= CLOSE_PULL_PX;
    start.current.sheet.style.transform = '';
    start.current = null;
    if (pulled) onClose();
  };

  return (
    <div
      aria-hidden
      className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center short:hidden"
      onPointerDown={(event) => {
        const sheet = event.currentTarget.closest<HTMLElement>('[data-slot="sheet"]');
        if (!sheet) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { y: event.clientY, sheet };
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="h-1 w-10 rounded-full bg-muted-foreground/50" />
    </div>
  );
}

/** A row in a sheet: a full-width button or link at least 44 px high, with its icon. */
export const SHEET_ROW =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50';
