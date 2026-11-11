import { create } from 'zustand';

/**
 * A pin being dragged on the globe (M6-T5): where it is now, before the move is saved. The
 * pins draw it there, and the events located at that place (if it's a place) go with it.
 */
export interface PinPreview {
  id: string;
  latDeg: number;
  lonDeg: number;
}

export const usePinPreview = create<{
  preview: PinPreview | null;
  show: (preview: PinPreview) => void;
  clear: () => void;
}>()((set) => ({
  preview: null,
  show: (preview) => {
    set({ preview });
  },
  clear: () => {
    set({ preview: null });
  },
}));
