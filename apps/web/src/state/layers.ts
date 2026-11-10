import { create } from 'zustand';

interface LayersState {
  /**
   * The layer that ⌘/Ctrl + Shift + G and "Remove from group" work in (M4-T2), such as
   * "Administrative": the layer last grouped in. Null until then, which means the first layer
   * in settings order (`activeLayerOf`). M4-T5's Layers popover adds visibility here.
   */
  activeLayer: string | null;
  setActiveLayer: (layer: string) => void;
}

export const useLayers = create<LayersState>()((set) => ({
  activeLayer: null,
  setActiveLayer: (layer) => {
    set({ activeLayer: layer });
  },
}));
