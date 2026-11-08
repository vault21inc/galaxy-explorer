import { useEffect, useRef } from 'react';
import { mountLabelPool } from './label-pool.ts';

/**
 * The DOM overlay that holds the labels, above the canvas and below the panels (rendering.md
 * §3, §11). It's hidden from screen readers: the outliner lists the same items accessibly
 * (ux.md §10). `<LabelDriver>` inside the canvas fills it after every rendered frame.
 */
export function LabelLayer() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    return mountLabelPool(container.current);
  }, []);
  return (
    <div
      ref={container}
      aria-hidden
      data-testid="label-layer"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    />
  );
}
