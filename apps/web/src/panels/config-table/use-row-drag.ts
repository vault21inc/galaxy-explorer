import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dropIndex } from './reorder.ts';

/** A drag in progress: the row's index, and the gap (0 to the row count) it would drop into. */
export interface RowDrag {
  from: number;
  gap: number;
}

/**
 * Dragging a settings row by its handle to reorder it (M4-T1), and the keyboard path: Arrow Up
 * and Arrow Down on the focused handle move the row by one. The handle captures the pointer,
 * so the drag follows it even outside the row; on release `onMove(from, to)` gets the indexes
 * before and after.
 */
export function useRowDrag(onMove: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [drag, setDrag] = useState<RowDrag | null>(null);

  const middles = () =>
    rows.current.flatMap((row) => {
      if (!row) return [];
      const rect = row.getBoundingClientRect();
      return [rect.top + rect.height / 2];
    });

  /** The gap above the first row whose middle is below the pointer. */
  const gapAt = (pointerYPx: number) => {
    const list = middles();
    const index = list.findIndex((middle) => pointerYPx < middle);
    return index === -1 ? list.length : index;
  };

  const handleProps = (index: number, count: number) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ from: index, gap: index });
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag?.from !== index) return;
      const gap = gapAt(event.clientY);
      if (gap !== drag.gap) setDrag({ from: index, gap });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (drag?.from !== index) return;
      setDrag(null);
      const to = dropIndex(middles(), event.clientY, index);
      if (to !== index) onMove(index, to);
    },
    onPointerCancel: () => {
      setDrag(null);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : null;
      if (to === null) return;
      event.preventDefault();
      if (to >= 0 && to < count) onMove(index, to);
    },
  });

  const rowRef = (index: number) => (element: HTMLElement | null) => {
    rows.current[index] = element;
  };

  return { drag, handleProps, rowRef };
}
