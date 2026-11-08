import { create } from 'zustand';

interface SpoilerState {
  /** "Show potential spoilers": off by default for every visitor (ux.md §6, P3). */
  showSpoilers: boolean;
}

/**
 * The spoiler policy. Renderers read it to black out spoiler content (M2-T3). M2-T7 adds the
 * top-bar toggle, Shift + S, remembering it per browser, and per-item reveals.
 */
export const useSpoilers = create<SpoilerState>()(() => ({ showSpoilers: false }));
