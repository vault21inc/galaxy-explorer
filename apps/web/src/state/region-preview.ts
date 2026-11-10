import type { RegionAppearance } from '@ge/domain';
import { create } from 'zustand';

interface RegionPreviewState {
  /** A region being reshaped on the map (M4-T6): its id and the settings shown meanwhile. */
  preview: { id: string; region: RegionAppearance } | null;
  show: (id: string, region: RegionAppearance) => void;
  clear: () => void;
}

/**
 * A region's radius or rift points while their handle is dragged, drawn before they're saved,
 * like the move preview (M3-T3). The galaxy view swaps it into that one region's appearance.
 */
export const useRegionPreview = create<RegionPreviewState>()((set) => ({
  preview: null,
  show: (id, region) => {
    set({ preview: { id, region } });
  },
  clear: () => {
    set({ preview: null });
  },
}));
