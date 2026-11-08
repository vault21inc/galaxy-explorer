import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';

/**
 * Label modes (ux.md §7): `hover` shows the hovered and selected items only (the default);
 * `groups` adds group names; `all` adds every visible object, decluttered. L cycles them, and
 * holding Space shows all while held.
 */
export const LABEL_MODES = ['hover', 'groups', 'all'] as const;
export type LabelMode = (typeof LABEL_MODES)[number];

interface LabelState {
  mode: LabelMode;
  /** Space is held: show all labels, whatever the mode. Not remembered. */
  showAllHeld: boolean;
  cycle: () => void;
  setShowAllHeld: (held: boolean) => void;
}

/** The label mode, remembered per browser; it changes on key presses, not per frame. */
export const useLabels = create<LabelState>()(
  persist(
    (set, get) => ({
      mode: 'hover',
      showAllHeld: false,
      cycle: () => {
        const index = LABEL_MODES.indexOf(get().mode);
        set({ mode: LABEL_MODES[(index + 1) % LABEL_MODES.length] ?? 'hover' });
      },
      setShowAllHeld: (held) => {
        if (get().showAllHeld !== held) set({ showAllHeld: held });
      },
    }),
    {
      name: 'ge.labels',
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
