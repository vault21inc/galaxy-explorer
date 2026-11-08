import { createStore } from 'zustand/vanilla';

/**
 * What the pointer is over (rendering.md §2, rule 3). It changes on every pointer move, so it's
 * a plain store outside React: the cursor and the hover ring subscribe to it directly and no
 * component re-renders while the pointer moves. M2-T6's label layer reads it the same way.
 */
export const hoverStore = createStore<{ hoveredId: string | null }>()(() => ({ hoveredId: null }));

export function setHovered(id: string | null): void {
  if (hoverStore.getState().hoveredId !== id) hoverStore.setState({ hoveredId: id });
}
