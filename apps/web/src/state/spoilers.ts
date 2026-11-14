import { SHOW_SPOILERS, type SpoilerPolicy } from '@ge/domain';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { safeStorage } from '@/lib/safe-storage.ts';
import { useEditor } from './editor.ts';

/**
 * Whether a first visit shows potential spoilers: no (P3), unless the deployment's build says
 * so (`VITE_DEFAULT_SPOILERS=shown`, D-38), as the private preview does for its testers. A
 * remembered choice replaces it.
 */
export const FIRST_SHOW_ALL = import.meta.env.VITE_DEFAULT_SPOILERS === 'shown';

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
      showAll: FIRST_SHOW_ALL,
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
 * neither field changes, so it's safe in hook dependencies. Edit mode shows everything
 * (ux.md §2, §6): the editor marks spoiler content instead of hiding it.
 */
export function useSpoilerPolicy(): SpoilerPolicy {
  const editing = useEditor((state) => state.editing);
  const policy = useSpoilers(
    useShallow((state) => ({ showAll: state.showAll, revealed: state.revealed })),
  );
  return editing ? SHOW_SPOILERS : policy;
}
