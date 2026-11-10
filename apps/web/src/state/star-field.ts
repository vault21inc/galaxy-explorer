import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';

interface StarFieldState {
  /** The share of the depth stars drawn, 0 (none) to 1 (all the quality setting allows). */
  density: number;
  /** Their brightness, 0 to 1 (as generated). */
  brightness: number;
  setDensity: (density: number) => void;
  setBrightness: (brightness: number) => void;
}

const share = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/**
 * How many of the galaxy's depth stars to draw, and how bright (rendering.md §13): a reader's
 * preference, remembered per browser in the quality popover, so labels and objects can stand
 * out without lowering the quality. Changing it redraws one frame; no stars are regenerated.
 */
export const useStarField = create<StarFieldState>()(
  persist(
    (set) => ({
      density: 1,
      brightness: 1,
      setDensity: (density) => {
        set({ density: share(density, 1) });
      },
      setBrightness: (brightness) => {
        set({ brightness: share(brightness, 1) });
      },
    }),
    {
      name: 'ge.stars',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ density, brightness }) => ({ density, brightness }),
      // A stored value from a future or broken build falls back to the defaults.
      merge: (stored, current) => {
        const values = (stored ?? {}) as { density?: unknown; brightness?: unknown };
        return {
          ...current,
          density: share(values.density, current.density),
          brightness: share(values.brightness, current.brightness),
        };
      },
    },
  ),
);
