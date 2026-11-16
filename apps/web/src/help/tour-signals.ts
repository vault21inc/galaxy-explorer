import { create } from 'zustand';

/**
 * What the canvas tells the tours (render/tour-anchor-driver.tsx), after frames it renders
 * anyway: where the step's object is on the page, and that the camera moved. Nothing here
 * asks for a frame, so a step that waits draws nothing (rendering.md §2).
 */
interface TourSignals {
  /** The object a step points at, in CSS pixels on the page; null while there's none on screen. */
  anchor: { id: string; x: number; y: number } | null;
  /** Counts camera moves while a tour runs; the `camera-moved` completion watches it. */
  cameraMoves: number;
}

export const useTourSignals = create<TourSignals>()(() => ({ anchor: null, cameraMoves: 0 }));
