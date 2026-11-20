import { create } from 'zustand';
import { currentTier } from '@/lib/layout-tier.ts';
import { useEditor } from './editor.ts';
import { useSelection } from './selection.ts';

/**
 * The heights the details panel rests at (docs/plan/later/phone-usability.md, "The details
 * sheet's three stops", D-58), smallest first. On a phone held upright it's a sheet along the
 * bottom: a `card` with the name and a line about it, `half` the screen, or `full`, up to the
 * top bar. The side panel (wider windows, and a phone on its side) has two states: collapsed
 * is `card`, and open is `half` or `full`.
 */
export const DETAILS_STOPS = ['card', 'half', 'full'] as const;
export type DetailsStop = (typeof DETAILS_STOPS)[number];

/** How long a choice by name waits for its selection: a transition between views takes a second or two. */
const PENDING_MS = 5_000;

/** The taller of two stops. */
export function tallerStop(a: DetailsStop, b: DetailsStop): DetailsStop {
  return DETAILS_STOPS.indexOf(a) >= DETAILS_STOPS.indexOf(b) ? a : b;
}

/** The stop the panel shows, from the stop asked for: the side panel has no `full`. */
export function shownStop(stop: DetailsStop, sidePanel: boolean): DetailsStop {
  return sidePanel && stop === 'full' ? 'half' : stop;
}

interface DetailsSheetState {
  stop: DetailsStop;
  /** A stop asked for by `raise`, for the selection about to be made, and when it was asked. */
  pending: { stop: DetailsStop; atMs: number } | null;
  setStop: (stop: DetailsStop) => void;
  /**
   * The reader chose something by name (a search result, a row in the List or in Events): its
   * details open at this stop at least. The selection may follow later, after a transition
   * between views, so the wish is kept until then.
   */
  raise: (atLeast: DetailsStop) => void;
}

/**
 * Where the details panel rests. Not saved: it's about what the reader is looking at now.
 * A tap on the map that selects from nothing gives the card on a phone, and the open panel on
 * wider windows, as before; a selection that changes keeps the stop; clearing it resets.
 * Entering edit mode opens the details, to show the form.
 */
export const useDetailsSheet = create<DetailsSheetState>()((set, get) => ({
  stop: firstStop(),
  pending: null,
  setStop: (stop) => {
    set({ stop });
  },
  raise: (atLeast) => {
    const showing = useSelection.getState().selectedIds.length > 0;
    set({
      stop: showing ? tallerStop(get().stop, atLeast) : get().stop,
      pending: { stop: atLeast, atMs: Date.now() },
    });
  },
}));

/**
 * What a selection made from nothing opens at: the card on a phone, the open panel elsewhere.
 * In edit mode the panel is the form, so it opens whatever the window.
 */
function firstStop(): DetailsStop {
  return currentTier() === 'slim' && !useEditor.getState().editing ? 'card' : 'half';
}

// The stop follows the selection, wherever it's changed from (the canvas, the keyboard, the
// address). A view change clears the selection and then makes the new one, so a wish from
// `raise` has to outlive the clearing.
useSelection.subscribe((state, before) => {
  if (state.selectedIds === before.selectedIds) return;
  const { stop, pending } = useDetailsSheet.getState();
  if (state.selectedIds.length === 0) {
    useDetailsSheet.setState({ stop: firstStop() });
    return;
  }
  const wished = pending && Date.now() - pending.atMs <= PENDING_MS ? pending.stop : null;
  const from = before.selectedIds.length === 0 ? firstStop() : stop;
  useDetailsSheet.setState({ stop: wished ? tallerStop(from, wished) : from, pending: null });
});

useEditor.subscribe((state, before) => {
  if (!state.editing || before.editing) return;
  useDetailsSheet.setState({ stop: tallerStop(useDetailsSheet.getState().stop, 'half') });
});
