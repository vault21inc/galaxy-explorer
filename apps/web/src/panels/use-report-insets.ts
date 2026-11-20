import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { NO_INSETS, setViewInsets } from '@/state/view-insets.ts';

interface Options {
  /**
   * The panel is opened over the map on a phone: past its card, not stepped aside for a sheet,
   * and not in capture mode. Otherwise nothing is covered that the view should make room for.
   */
  active: boolean;
  /** A sheet along the bottom (a phone upright), not a panel on the right (on its side). */
  sheet: boolean;
  /** The sheet is under a finger: the view waits for the stop it lands on. */
  dragging: boolean;
  /** The stop it rests at: a change of stop is a change of height. */
  stop: string;
}

/**
 * Tells the canvas how much of it the details panel covers (state/view-insets.ts), so the view
 * can center itself in the rest (rendering.md §12, "The view shift", D-58).
 *
 * Measured when the stop changes, when the panel's own size changes (its contents arrive, the
 * window turns) and never from a pointer move. Call it before the effect that animates the
 * panel between stops: here the panel already has its new height, and once the animation has
 * started its height is on the way there, which is why a measurement during one is skipped.
 */
export function useReportInsets(
  panel: RefObject<HTMLElement | null>,
  { active, sheet, dragging, stop }: Options,
): void {
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element || !active) {
      setViewInsets(NO_INSETS);
      return;
    }
    if (dragging) return;
    const measure = () => {
      if (element.getAnimations().length > 0) return;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      if (sheet) {
        const bar = document.querySelector('header')?.getBoundingClientRect();
        setViewInsets({
          topPx: bar?.bottom ?? 0,
          rightPx: 0,
          // At its full height the sheet covers everything: the view stays where half put it.
          bottomPx: Math.min(box.height, window.innerHeight / 2),
        });
      } else {
        setViewInsets({ topPx: 0, rightPx: window.innerWidth - box.left, bottomPx: 0 });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [panel, active, sheet, dragging, stop]);

  // Gone with the selection: nothing is covered.
  useEffect(
    () => () => {
      setViewInsets(NO_INSETS);
    },
    [],
  );
}
