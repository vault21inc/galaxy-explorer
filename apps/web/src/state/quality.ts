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
  /** A short message after an automatic step-down, until dismissed. Not remembered. */
  notice: string | null;
  setLevel: (level: QualityLevel) => void;
  /** Lowers the level by one, if it can, and says so. */
  stepDown: () => void;
  dismissNotice: () => void;
}

/**
 * The quality setting (rendering.md §13), remembered per browser. It changes rarely, so React
 * state through zustand is fine here; per-frame data never goes in a store like this.
 */
export const useQuality = create<QualityState>()(
  persist(
    (set, get) => ({
      level: DEFAULT_QUALITY,
      notice: null,
      setLevel: (level) => {
        set({ level });
      },
      stepDown: () => {
        const index = QUALITY_LEVELS.indexOf(get().level);
        const lower = QUALITY_LEVELS[index - 1];
        if (!lower) return;
        set({
          level: lower,
          notice: `Quality lowered to ${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)} to keep the view smooth.`,
        });
      },
      dismissNotice: () => {
        set({ notice: null });
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
