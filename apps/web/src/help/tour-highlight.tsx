import type { TargetBox } from './use-target.ts';

/** Space between a control and its ring, in CSS pixels. */
const RING_GAP_PX = 4;

/**
 * The ring around what a step points at (ux.md §12): drawn in the page over the canvas, never
 * in it, so a tour adds no draw calls. It lets clicks through, and is for the eye only: the
 * popover says in words what it points at. It moves without easing when the reader asks for
 * reduced motion (ux.md §10).
 */
export function TourHighlight({ box }: { box: TargetBox }) {
  const gap = box.shape === 'box' ? RING_GAP_PX : 0;
  return (
    <div
      aria-hidden
      data-tour-highlight
      className={
        'pointer-events-none fixed z-40 border-2 border-primary shadow-[0_0_0_4px_rgb(0_0_0/0.35)] motion-safe:transition-[left,top,width,height] motion-safe:duration-150 ' +
        (box.shape === 'circle' ? 'rounded-full' : 'rounded-lg')
      }
      style={{
        left: box.left - gap,
        top: box.top - gap,
        width: box.width + 2 * gap,
        height: box.height + 2 * gap,
      }}
    />
  );
}
