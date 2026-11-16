import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage.ts';
import { STORAGE_KEYS } from '@/state/storage-keys.ts';
import { COMPLETIONS } from './completions.ts';
import { needsMet } from './needs.ts';
import { TOURS } from './tours.ts';
import type { TourId } from './tour-types.ts';

/** The editor tour's practice universe (practice.ts), while the tour or its ending needs it. */
export interface Practice {
  universeId: string;
  slug: string;
}

interface TourState {
  /** The tour running and the step showing; null when none runs. */
  active: { tour: TourId; index: number } | null;
  practice: Practice | null;
  /** The editor tour has ended: asking whether to delete the practice universe. */
  finishing: boolean;
  /**
   * A tour to start once its map is open and ready (tour-layer.tsx): the editor tour waits for
   * its practice universe's map, and for edit mode to be offered there.
   */
  pending: { tour: TourId; practice: Practice | null } | null;
  prepare: (tour: TourId, practice?: Practice) => void;
  start: (tour: TourId, practice?: Practice) => void;
  next: () => void;
  back: () => void;
  /** Esc, End, or past the last step. The editor tour then asks about its universe. */
  end: () => void;
  /** The practice universe was deleted or kept: the editor tour is over. */
  finished: () => void;
}

/**
 * Whether a step should show now: its needs hold (needs.ts), and the reader hasn't already
 * done what it asks (edit mode is on already). Either way, it's passed over.
 */
function shows(tour: TourId, index: number): boolean {
  const step = TOURS[tour].steps[index];
  if (!step) return false;
  return needsMet(step) && COMPLETIONS[step.completes].already?.() !== true;
}

/** The next step from `index` in `direction` that shows, or null past either end. */
function stepFrom(tour: TourId, index: number, direction: 1 | -1): number | null {
  const count = TOURS[tour].steps.length;
  for (let at = index; at >= 0 && at < count; at += direction) {
    if (shows(tour, at)) return at;
  }
  return null;
}

/**
 * The tour running (M8-T10, ux.md §12). Steps move on with Next or when the reader does the
 * thing (tour-layer.tsx), and skip themselves when they'd make no sense. Not remembered:
 * reloading ends a tour.
 */
export const useTour = create<TourState>()((set, get) => ({
  active: null,
  practice: null,
  finishing: false,
  pending: null,
  prepare: (tour, practice) => {
    set({ pending: { tour, practice: practice ?? null }, active: null });
  },
  start: (tour, practice) => {
    const index = stepFrom(tour, 0, 1);
    set({
      active: index === null ? null : { tour, index },
      practice: practice ?? null,
      pending: null,
      finishing: false,
    });
    useTourOffers.getState().dismiss(tour);
  },
  next: () => {
    const { active } = get();
    if (!active) return;
    const index = stepFrom(active.tour, active.index + 1, 1);
    if (index === null) get().end();
    else set({ active: { ...active, index } });
  },
  back: () => {
    const { active } = get();
    if (!active) return;
    const index = stepFrom(active.tour, active.index - 1, -1);
    if (index !== null) set({ active: { ...active, index } });
  },
  end: () => {
    set((state) => ({ active: null, finishing: state.practice !== null }));
  },
  finished: () => {
    set({ practice: null, finishing: false });
  },
}));

/** Which tours have been offered and turned down, or taken: each is offered once per browser. */
interface TourOffers {
  dismissed: Partial<Record<TourId, true>>;
  dismiss: (tour: TourId) => void;
}

export const useTourOffers = create<TourOffers>()(
  persist(
    (set, get) => ({
      dismissed: {},
      dismiss: (tour) => {
        if (get().dismissed[tour]) return;
        set({ dismissed: { ...get().dismissed, [tour]: true } });
      },
    }),
    {
      name: STORAGE_KEYS.tours.key,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ dismissed: state.dismissed }),
      // A stored value from a future or broken build counts as nothing offered yet.
      merge: (stored, current) => {
        const dismissed = (stored as { dismissed?: unknown } | undefined)?.dismissed;
        if (typeof dismissed !== 'object' || dismissed === null) return current;
        const kept = Object.fromEntries(
          Object.entries(dismissed).filter(([tour, value]) => tour in TOURS && value === true),
        );
        return { ...current, dismissed: kept };
      },
    },
  ),
);
