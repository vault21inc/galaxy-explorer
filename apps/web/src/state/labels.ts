import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';
import { STORAGE_KEYS } from './storage-keys.ts';

/**
 * Label modes (ux.md §7): `hover` shows the hovered and selected items only (the default);
 * `groups` adds group and route names (M4-T7); `all` adds every visible object, decluttered. L
 * cycles them, and holding Space shows all while held.
 */
export const LABEL_MODES = ['hover', 'groups', 'all'] as const;
export type LabelMode = (typeof LABEL_MODES)[number];

/** A label mode from untrusted text (a build setting), or `fallback` if it isn't one. */
export function labelModeOr(value: unknown, fallback: LabelMode): LabelMode {
  return (LABEL_MODES as readonly unknown[]).includes(value) ? (value as LabelMode) : fallback;
}

/**
 * The mode a first visit starts in: hover only, unless the deployment's build says otherwise
 * (`VITE_DEFAULT_LABEL_MODE`, D-38). A remembered choice replaces it.
 */
export const FIRST_LABEL_MODE = labelModeOr(import.meta.env.VITE_DEFAULT_LABEL_MODE, 'hover');

interface LabelState {
  mode: LabelMode;
  /** Space is held: show all labels, whatever the mode. Not remembered. */
  showAllHeld: boolean;
  /** The L key: hover → groups → all → hover. */
  cycle: () => void;
  /** The Labels control in the Layers panel (L3-T3): the way to change it without a key. */
  setMode: (mode: LabelMode) => void;
  setShowAllHeld: (held: boolean) => void;
}

/** The label mode, remembered per browser; it changes on key presses, not per frame. */
export const useLabels = create<LabelState>()(
  persist(
    (set, get) => ({
      mode: FIRST_LABEL_MODE,
      showAllHeld: false,
      cycle: () => {
        const index = LABEL_MODES.indexOf(get().mode);
        set({ mode: LABEL_MODES[(index + 1) % LABEL_MODES.length] ?? 'hover' });
      },
      setMode: (mode) => {
        set({ mode });
      },
      setShowAllHeld: (held) => {
        if (get().showAllHeld !== held) set({ showAllHeld: held });
      },
    }),
    {
      name: STORAGE_KEYS.labels.key,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ mode: state.mode }),
      merge: (stored, current) => {
        const mode = (stored as { mode?: unknown } | undefined)?.mode;
        return (LABEL_MODES as readonly unknown[]).includes(mode)
          ? { ...current, mode: mode as LabelMode }
          : current;
      },
    },
  ),
);

/** The mode in effect: `all` while Space is held. */
export function effectiveLabelMode(state: Pick<LabelState, 'mode' | 'showAllHeld'>): LabelMode {
  return state.showAllHeld ? 'all' : state.mode;
}
