import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Button } from '@/components/ui/button.tsx';
import { FINE_POINTER_QUERY, useMediaQuery } from '@/lib/layout-tier.ts';
import type { TourStep } from './tour-types.ts';
import type { TargetBox } from './use-target.ts';

/** The popover's width, and its gap from what it points at, in CSS pixels. */
const WIDTH_PX = 320;
const GAP_PX = 12;
const MARGIN_PX = 16;
/** Room it needs below a target to sit there rather than above. */
const ROOM_BELOW_PX = 220;

interface TourPopoverProps {
  step: TourStep;
  number: number;
  count: number;
  target: TargetBox | null;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
  onEnd: () => void;
}

/**
 * A tour step (ux.md §12): a non-modal popover beside its target, "Tour, step 3 of 12", with
 * Back, Next and End. It's a labelled region, not a dialog, so the app's keys still work while
 * it has focus (input/use-keyboard.ts ignores keys inside dialogs), which steps like "press L"
 * need. Esc inside it ends the tour, and stops there, so the app doesn't also clear the
 * selection.
 */
export function TourPopover(props: TourPopoverProps) {
  const { step, number, count, target, canGoBack, onBack, onNext, onEnd } = props;
  const region = useRef<HTMLElement>(null);
  const last = number === count;
  // No mouse or trackpad: the step in a phone's words (L3-T3).
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);

  // Focus comes to each new step, unless the reader is typing (naming the object just placed).
  useEffect(() => {
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      active.closest('input, textarea, select, [contenteditable="true"]') !== null;
    if (!typing) region.current?.focus({ preventScroll: true });
  }, [step.id]);

  const style = usePlacement(target, region);
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label={`Tour, step ${String(number)} of ${String(count)}`}
      aria-describedby={`tour-step-${step.id}`}
      data-tour-step={step.id}
      style={style}
      className="pointer-events-auto fixed z-[45] flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onEnd();
      }}
    >
      <p className="text-xs text-muted-foreground" aria-hidden>
        Tour · {number} of {count}
      </p>
      <h2 className="font-medium">{step.title}</h2>
      <p id={`tour-step-${step.id}`} className="leading-relaxed">
        {finePointer ? step.text : (step.touchText ?? step.text)}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEnd}>
          End
        </Button>
        <span className="ml-auto" />
        {canGoBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
        )}
        <Button size="sm" onClick={onNext}>
          {last ? 'Finish' : 'Next'}
        </Button>
      </div>
    </section>
  );
}

/**
 * Below the target if there's room, else above it, kept inside the window; for the whole view,
 * low in the middle, clear of the edit toolbar.
 */
function usePlacement(
  target: TargetBox | null,
  region: RefObject<HTMLElement | null>,
): CSSProperties {
  const [height, setHeight] = useState(0);
  // Its own height, to sit above a target: measured as it changes, after layout.
  useLayoutEffect(() => {
    const element = region.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setHeight(element.offsetHeight);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [region]);
  // The room it has: the window, less an open sheet the target isn't in (on a phone).
  const room = roomBesideSheet(target);
  const width = Math.min(WIDTH_PX, room.right - room.left - 2 * MARGIN_PX);
  if (!target) {
    return {
      width,
      left: room.left + (room.right - room.left - width) / 2,
      bottom: window.innerHeight - room.bottom + 88,
    };
  }
  const centerX = target.left + target.width / 2;
  const left = Math.min(
    Math.max(centerX - width / 2, room.left + MARGIN_PX),
    room.right - width - MARGIN_PX,
  );
  const below = target.top + target.height + GAP_PX;
  const fitsBelow = below + Math.max(height, ROOM_BELOW_PX) < room.bottom - MARGIN_PX;
  return fitsBelow
    ? { width, left, top: below }
    : { width, left, top: Math.max(MARGIN_PX, target.top - GAP_PX - height) };
}

/**
 * The part of the window a step can use without covering an open sheet: above a sheet along
 * the bottom, or left of one on the right (a phone on its side). A step pointing into the sheet
 * keeps the whole window: it sits above or below its row as anywhere else.
 */
function roomBesideSheet(target: TargetBox | null): {
  left: number;
  right: number;
  bottom: number;
} {
  const room = { left: 0, right: window.innerWidth, bottom: window.innerHeight };
  // A sheet from the slim bar, or else the details sheet (hidden while one of those is open).
  const sheet = [...document.querySelectorAll('[data-slot="sheet"], [data-slot="details-sheet"]')]
    .map((element) => element.getBoundingClientRect())
    .find((box) => box.height > 0);
  if (!sheet) return room;
  const inside =
    target !== null &&
    target.left >= sheet.left &&
    target.left + target.width <= sheet.right &&
    target.top >= sheet.top &&
    target.top + target.height <= sheet.bottom;
  if (inside) return room;
  // A sheet from the right reaches the top of the window; one from the bottom doesn't.
  return sheet.top <= 1 ? { ...room, right: sheet.left } : { ...room, bottom: sheet.top };
}
