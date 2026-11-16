import { useEffect, useState } from 'react';
import { useTourSignals } from './tour-signals.ts';
import type { TourTarget } from './tour-types.ts';

/** Where a step points, on the page: a control's box, or a circle around an object. */
export interface TargetBox {
  left: number;
  top: number;
  width: number;
  height: number;
  shape: 'box' | 'circle';
}

/** An object's highlight: a circle this wide around its center, in CSS pixels. */
const OBJECT_RING_PX = 44;
/** How often a control's box is measured again while a step shows it (panels open, the window resizes). */
const REMEASURE_MS = 250;

/**
 * The step's target on the page, or null for the whole view, or while it isn't there (a panel
 * not open yet, an object off screen). A control is found by its `data-tour` mark; an object
 * by the canvas's anchor (render/tour-anchor-driver.tsx), which moves only when frames render.
 */
export function useTarget(target: TourTarget | undefined): TargetBox | null {
  const anchor = useTourSignals((state) => state.anchor);
  const control = target?.kind === 'control' ? target.name : null;
  // The box, with the control it's of: a box measured for the previous step never shows.
  const [measured, setMeasured] = useState<{ name: string; box: TargetBox | null } | null>(null);

  useEffect(() => {
    if (control === null) return;
    const measure = () => {
      setMeasured((before) => {
        const box = controlBox(control);
        return before?.name === control && sameBox(before.box, box)
          ? before
          : { name: control, box };
      });
    };
    // Timers, not animation frames: a control moves rarely, and this draws nothing.
    const first = window.setTimeout(measure, 0);
    const timer = window.setInterval(measure, REMEASURE_MS);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [control]);

  if (target?.kind === 'object') {
    if (!anchor) return null;
    const half = OBJECT_RING_PX / 2;
    return {
      left: anchor.x - half,
      top: anchor.y - half,
      width: OBJECT_RING_PX,
      height: OBJECT_RING_PX,
      shape: 'circle',
    };
  }
  return control !== null && measured?.name === control ? measured.box : null;
}

/** The first visible element marked `data-tour="<name>"`. */
export function controlElement(name: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

function controlBox(name: string): TargetBox | null {
  const element = controlElement(name);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, shape: 'box' };
}

function sameBox(a: TargetBox | null, b: TargetBox | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
