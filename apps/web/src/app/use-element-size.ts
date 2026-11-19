import { useEffect, useState, type RefObject } from 'react';

/**
 * An element's size in CSS pixels, kept current with a ResizeObserver; null before it's
 * measured. It changes only when the element is resized, never per frame.
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return size;
}
