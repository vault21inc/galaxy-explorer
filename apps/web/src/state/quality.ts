import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';
import { STORAGE_KEYS } from './storage-keys.ts';
import {
  DEFAULT_QUALITY,
  QUALITY_LEVELS,
  QUALITY_PRESETS,
  type QualityLevel,
} from '@/render/tuning.ts';

interface QualityState {
  level: QualityLevel;
  /**
   * Planets spin and clouds drift in the orbit view (M6-T3, rendering.md §8). Off by default:
   * it draws up to 30 frames a second while it runs, where a still view draws none. Reduced
   * motion turns it off whatever this says (`useAmbientMotion`).
   */
  ambientMotion: boolean;
  setAmbientMotion: (on: boolean) => void;
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
      ambientMotion: false,
      notice: null,
      setLevel: (level) => {
        set({ level });
      },
      setAmbientMotion: (on) => {
        set({ ambientMotion: on });
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
      name: STORAGE_KEYS.quality.key,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ level: state.level, ambientMotion: state.ambientMotion }),
      // A stored value from a future or broken build falls back to the default.
      merge: (stored, current) => {
        const { level, ambientMotion } = (stored ?? {}) as {
          level?: unknown;
          ambientMotion?: unknown;
        };
        return {
          ...current,
          ...(isQualityLevel(level) ? { level } : {}),
          ...(typeof ambientMotion === 'boolean' ? { ambientMotion } : {}),
        };
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

/**
 * Whether ambient motion runs now: switched on in the quality settings, and the reader hasn't
 * asked their system for reduced motion (checked as it changes).
 */
export function useAmbientMotion(): boolean {
  const on = useQuality((state) => state.ambientMotion);
  const reduced = useReducedMotion();
  return on && !reduced;
}

/** Whether the reader has asked their system for reduced motion, checked as it changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}
