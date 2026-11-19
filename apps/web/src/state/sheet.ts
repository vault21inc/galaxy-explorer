import { create } from 'zustand';

/**
 * The sheets of the slim tier (docs/plan/later/phone-usability.md, "Sheets"): what opens
 * from the slim bar's location chip and More button, and the panels More leads to.
 */
export const SHEET_IDS = [
  'location',
  'more',
  'list',
  'events',
  'layers',
  'display',
  'help',
  'account',
  'capture',
] as const;
export type SheetId = (typeof SHEET_IDS)[number];

interface SheetState {
  /** The sheet open now, or null. */
  open: SheetId | null;
  /** Opens a sheet, replacing whichever was open: there's never more than one. */
  show: (id: SheetId) => void;
  close: () => void;
}

/**
 * Which sheet is open. One at a time, so the map is never under more than one thing: the info
 * panel steps aside while a sheet is open (panels/info-panel.tsx), and comes back after.
 */
export const useSheet = create<SheetState>()((set) => ({
  open: null,
  show: (id) => {
    set({ open: id });
  },
  close: () => {
    set({ open: null });
  },
}));
