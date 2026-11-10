import { create } from 'zustand';

interface TransitionState {
  /** A change of view is under way: the overlay takes pointer input so nothing lands mid-swap. */
  active: boolean;
  /** The black overlay's target opacity, 0 or 1; CSS animates toward it over `fadeMs`. */
  opacity: 0 | 1;
  fadeMs: number;
}

/** What `<TransitionOverlay>` draws; the controller (transition-controller.ts) drives it. */
export const useTransition = create<TransitionState>()(() => ({
  active: false,
  opacity: 0,
  fadeMs: 0,
}));
