import { create } from 'zustand';

interface RegionEditState {
  /** The rift whose points a click on the map adds to, or null (M4-T6). */
  addingPointsTo: string | null;
  /** The rift point selected with its handle, which Delete removes: [rift id, index]. */
  selectedPoint: readonly [string, number] | null;
  startAddingPoints: (riftId: string) => void;
  stopAddingPoints: () => void;
  selectPoint: (point: readonly [string, number] | null) => void;
}

/** Editing a region's shape on the map: its radius handle and a rift's points (M4-T6). */
export const useRegionEdit = create<RegionEditState>()((set) => ({
  addingPointsTo: null,
  selectedPoint: null,
  startAddingPoints: (riftId) => {
    set({ addingPointsTo: riftId });
  },
  stopAddingPoints: () => {
    set({ addingPointsTo: null });
  },
  selectPoint: (point) => {
    set({ selectedPoint: point });
  },
}));
