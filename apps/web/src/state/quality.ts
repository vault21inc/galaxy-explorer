import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';
import {
  DEFAULT_QUALITY,
  QUALITY_LEVELS,
  QUALITY_PRESETS,
  type QualityLevel,
} from '@/render/tuning.ts';

interface QualityState {
  level: QualityLevel;
  setLevel: (level: QualityLevel) => void;
}

/**
 * The quality setting (rendering.md §13), remembered per browser. It changes rarely, so React
 * state through zustand is fine here; per-frame data never goes in a store like this.
 */
export const useQuality = create<QualityState>()(
  persist(
    (set) => ({
      level: DEFAULT_QUALITY,
      setLevel: (level) => {
        set({ level });
      },
    }),
    {
      name: 'ge.quality',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ level: state.level }),
      // A stored value from a future or broken build falls back to the default.
      merge: (stored, current) => {
        const level = (stored as { level?: unknown } | undefined)?.level;
        return isQualityLevel(level) ? { ...current, level } : current;
      },
    },
  ),
);

function isQualityLevel(value: unknown): value is QualityLevel {
  return (QUALITY_LEVELS as readonly unknown[]).includes(value);
}

/** The current level's preset: DPR range, MSAA, star count and texture size. */
export function useQualityPreset() {
  return QUALITY_PRESETS[useQuality((state) => state.level)];
}
