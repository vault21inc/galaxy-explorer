import type { GalaxySettings, Underlay } from '@ge/domain';
import { create } from 'zustand';

/** What the Map settings panel is showing before it's saved (M3-T8). */
export interface MapPreview {
  mapId: string;
  galaxySettings?: GalaxySettings;
  underlay?: Underlay;
}

interface GalaxyPreviewState {
  preview: MapPreview | null;
  /** Shows these values in the canvas while a slider moves; merged into the current preview. */
  show: (preview: MapPreview) => void;
  clear: () => void;
}

/**
 * The live preview of map settings (M3-T8, rendering.md §9). A slider writes here on every
 * step; the canvas draws from it (the disc re-baked small, debounced) until the change is saved
 * and the map payload carries it. Only slider drags pass through here, not every frame.
 */
export const useGalaxyPreview = create<GalaxyPreviewState>()((set, get) => ({
  preview: null,
  show: (preview) => {
    const current = get().preview;
    set({ preview: current?.mapId === preview.mapId ? { ...current, ...preview } : preview });
  },
  clear: () => {
    if (get().preview) set({ preview: null });
  },
}));
