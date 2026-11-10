import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';

interface LayersState {
  /**
   * The layer that ⌘/Ctrl + Shift + G and "Remove from group" work in (M4-T2), such as
   * "Administrative": chosen in the Layers popover, or the layer last grouped in. Null means
   * the first layer in settings order (`activeLayerOf`). Not remembered.
   */
  activeLayer: string | null;
  setActiveLayer: (layer: string) => void;
  /**
   * Hidden layers, by universe: layer names are only unique within one (M4-T5). Hiding a layer
   * hides every group of its types, including types added to it later.
   */
  hiddenLayers: Record<string, string[]>;
  /** Hidden group types, by id (unique across universes). */
  hiddenTypes: string[];
  setLayerHidden: (universeId: string, layer: string, hidden: boolean) => void;
  setTypeHidden: (typeId: string, hidden: boolean) => void;
}

const toggled = (list: readonly string[], item: string, on: boolean) =>
  on ? [...new Set([...list, item])] : list.filter((entry) => entry !== item);

/** Layer visibility (M4-T5), remembered per browser like the label mode. */
export const useLayers = create<LayersState>()(
  persist(
    (set) => ({
      activeLayer: null,
      setActiveLayer: (layer) => {
        set({ activeLayer: layer });
      },
      hiddenLayers: {},
      hiddenTypes: [],
      setLayerHidden: (universeId, layer, hidden) => {
        set((state) => ({
          hiddenLayers: {
            ...state.hiddenLayers,
            [universeId]: toggled(state.hiddenLayers[universeId] ?? [], layer, hidden),
          },
        }));
      },
      setTypeHidden: (typeId, hidden) => {
        set((state) => ({ hiddenTypes: toggled(state.hiddenTypes, typeId, hidden) }));
      },
    }),
    {
      name: 'ge.layers',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ hiddenLayers: state.hiddenLayers, hiddenTypes: state.hiddenTypes }),
      // Whatever was stored, only well-formed lists of strings come back.
      merge: (stored, current) => {
        const value = (stored ?? {}) as { hiddenLayers?: unknown; hiddenTypes?: unknown };
        const strings = (list: unknown) =>
          Array.isArray(list)
            ? list.filter((item): item is string => typeof item === 'string')
            : [];
        const layers =
          typeof value.hiddenLayers === 'object' && value.hiddenLayers !== null
            ? Object.fromEntries(
                Object.entries(value.hiddenLayers).map(([key, list]) => [key, strings(list)]),
              )
            : {};
        return { ...current, hiddenLayers: layers, hiddenTypes: strings(value.hiddenTypes) };
      },
    },
  ),
);

/** What's hidden in one universe, as the outline renderer and the legend check it. */
export interface LayerVisibility {
  hiddenLayers: ReadonlySet<string>;
  hiddenTypes: ReadonlySet<string>;
}

/** Whether a group of this type shows: neither its layer nor its type is hidden. */
export function isTypeShown(
  type: { id: string; layer: string } | undefined,
  visibility: LayerVisibility,
): boolean {
  if (!type) return true;
  return !visibility.hiddenLayers.has(type.layer) && !visibility.hiddenTypes.has(type.id);
}

const NONE: readonly string[] = [];

/** One universe's visibility as React state; it changes only when the owner toggles a layer. */
export function useLayerVisibility(universeId: string): LayerVisibility {
  const layers = useLayers((state) => state.hiddenLayers[universeId] ?? NONE);
  const types = useLayers((state) => state.hiddenTypes);
  return useMemo(
    () => ({ hiddenLayers: new Set(layers), hiddenTypes: new Set(types) }),
    [layers, types],
  );
}
