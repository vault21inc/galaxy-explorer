import type { SpoilerPolicy } from '@ge/domain';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { safeStorage } from '@/lib/safe-storage.ts';

interface SpoilerState {
  /** "Spoilers: Shown": off by default for every visitor (ux.md §6, P3). Remembered per browser. */
  showAll: boolean;
  /**
   * Items revealed one at a time by clicking their redaction bar, by `spoilerKeys` key. Kept
   * until the page reloads, as ux.md §6 asks; never stored.
   */
  revealed: ReadonlySet<string>;
  toggle: () => void;
  reveal: (key: string) => void;
}

/**
 * The spoiler policy (ux.md §6, architecture.md §10): the top-bar toggle and Shift + S switch
 * `showAll`; clicking a bar reveals that item. The bodies, labels and panel all read it, so
 * revealing an entity in the panel also reveals its body and label.
 */
export const useSpoilers = create<SpoilerState>()(
  persist(
    (set, get) => ({
      showAll: false,
      revealed: new Set<string>(),
      toggle: () => {
        set({ showAll: !get().showAll });
      },
      reveal: (key) => {
        if (get().revealed.has(key)) return;
        set({ revealed: new Set([...get().revealed, key]) });
      },
    }),
    {
      name: 'ge.spoilers',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ showAll: state.showAll }),
      merge: (stored, current) => {
        const showAll = (stored as { showAll?: unknown } | undefined)?.showAll;
        return typeof showAll === 'boolean' ? { ...current, showAll } : current;
      },
    },
  ),
);

/**
 * The policy as the domain's redaction functions take it. The object stays the same while
 * neither field changes, so it's safe in hook dependencies.
 */
export function useSpoilerPolicy(): SpoilerPolicy {
  return useSpoilers(useShallow((state) => ({ showAll: state.showAll, revealed: state.revealed })));
}
