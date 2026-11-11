/**
 * What the orbit view's globe draws now (M6-T3), for the test hooks: which bakes or upload it
 * shows, which layers are on, and how far it has turned.
 */
export interface GlobeState {
  subjectId: string;
  albedoKey: string;
  layersKey: string;
  uploaded: boolean;
  tiltDeg: number;
  clouds: boolean;
  atmosphere: boolean;
  rings: boolean;
  /** Lit by a star of its system, rather than the default light of a body outside one. */
  sunFromStar: boolean;
  /** The surface's turn about its axis so far, in degrees: grows only with ambient motion. */
  spinDeg: () => number;
  /**
   * Where a point of the globe's frame is in the world now, after its tilt and turn: for
   * checking pins against their latitude and longitude.
   */
  toWorld: (point: readonly [number, number, number]) => [number, number, number];
  /** And back: a world point in the globe's own frame, as its latitude and longitude use. */
  toGlobe: (point: readonly [number, number, number]) => [number, number, number];
}

let current: GlobeState | null = null;

export function publishGlobe(state: GlobeState | null): void {
  current = state;
}

export function globeState(): GlobeState | null {
  return current;
}
