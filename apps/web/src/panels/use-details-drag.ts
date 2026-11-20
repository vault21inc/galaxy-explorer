import { useRef, type PointerEvent, type RefObject } from 'react';
import { DRAG_SLOP_PX, snapStop } from '@/components/ui/sheet-drag.ts';
import { DETAILS_STOPS, type DetailsStop } from '@/state/details-sheet.ts';

/** The card's height before it has been measured, in CSS pixels. */
const CARD_HEIGHT_GUESS_PX = 104;
/** The gap left between the top bar and the sheet at its full height, in CSS pixels. */
const FULL_GAP_PX = 4;

interface Drag {
  pointerId: number;
  startY: number;
  startHeightPx: number;
  heightsPx: number[];
  from: number;
  moved: boolean;
  heightPx: number;
  lastY: number;
  lastMs: number;
  /** Upward speed at the last move, in CSS pixels per millisecond. */
  speed: number;
}

interface Options {
  /** The panel is a sheet along the bottom (a phone upright): it can be dragged. */
  sheet: boolean;
  stop: DetailsStop;
  panel: RefObject<HTMLElement | null>;
  /** The card's height when it was last showing, for a drag that starts higher up. */
  cardHeightPx: RefObject<number | null>;
  /** The strip was tapped, not dragged, and not on one of its buttons. */
  onTap: () => void;
  /** A drag began: the details mount under the strip so they rise with the finger. */
  onDragStart: () => void;
  /** The finger moved: the sheet is this tall now. Called per move, so no React state. */
  onDragMove: (heightPx: number) => void;
  /** The finger lifted with the sheet at `heightPx`: rest at `stop`, or close. */
  onDragEnd: (stop: DetailsStop | 'close', heightPx: number) => void;
}

/**
 * Dragging the details sheet by its strip (docs/plan/later/phone-usability.md, "The details
 * sheet's three stops"): the sheet's height follows the finger (`onDragMove`, which writes it
 * straight to the element), and where it rests is `snapStop`'s to say. A press that doesn't
 * move is a tap. Presses on the strip's buttons and links are left to them.
 */
export function useDetailsDrag({
  sheet,
  stop,
  panel,
  cardHeightPx,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Options) {
  const drag = useRef<Drag | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const element = panel.current;
    if (!element || !event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    // A finger stays with the element it pressed; a mouse doesn't, and a quick drag would
    // leave the strip before it had moved far enough to count.
    if (sheet) event.currentTarget.setPointerCapture(event.pointerId);
    const header = document.querySelector('header')?.getBoundingClientRect();
    const startHeightPx = element.getBoundingClientRect().height;
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeightPx,
      heightsPx: [
        cardHeightPx.current ?? CARD_HEIGHT_GUESS_PX,
        window.innerHeight / 2,
        window.innerHeight - (header?.bottom ?? 0) - FULL_GAP_PX,
      ],
      from: DETAILS_STOPS.indexOf(stop),
      moved: false,
      heightPx: startHeightPx,
      lastY: event.clientY,
      lastMs: event.timeStamp,
      speed: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!sheet || current?.pointerId !== event.pointerId) return;
    const risenPx = current.startY - event.clientY;
    if (!current.moved) {
      if (Math.abs(risenPx) < DRAG_SLOP_PX) return;
      current.moved = true;
      onDragStart();
    }
    const elapsedMs = event.timeStamp - current.lastMs;
    if (elapsedMs > 0) current.speed = (current.lastY - event.clientY) / elapsedMs;
    current.lastY = event.clientY;
    current.lastMs = event.timeStamp;
    const tallestPx = current.heightsPx[current.heightsPx.length - 1] ?? window.innerHeight;
    current.heightPx = Math.min(tallestPx, Math.max(0, current.startHeightPx + risenPx));
    onDragMove(current.heightPx);
  };

  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) {
      if (!cancelled) onTap();
      return;
    }
    // A finger that stopped before lifting isn't a flick, however fast it moved earlier.
    const stale = event.timeStamp - current.lastMs > 100;
    const speed = cancelled || stale ? 0 : current.speed;
    const rest = snapStop(current.heightsPx, current.from, current.heightPx, speed);
    onDragEnd(rest === 'close' ? 'close' : (DETAILS_STOPS[rest] ?? 'card'), current.heightPx);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      end(event, false);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      end(event, true);
    },
  };
}
