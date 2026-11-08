import type { ResolvedGalaxySettings } from '@ge/domain/galaxy';
import { generateGalaxyPoints, type GalaxyPoints } from '@/render/galaxy/galaxy-points.ts';

/**
 * Generates the galaxy's depth stars off the main thread (rendering.md §6). The arrays are
 * transferred back, not copied: their memory moves to the page, so even 40,000 stars cost
 * no copy.
 */

export interface GalaxyPointsRequest {
  id: number;
  settings: ResolvedGalaxySettings;
  count: number;
}

export interface GalaxyPointsResponse {
  id: number;
  points: GalaxyPoints;
}

// The app's TypeScript setup types `self` as a window. In a worker, `postMessage` takes the
// message and a transfer list, so this is the shape actually used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<GalaxyPointsRequest>) => void) | null;
  postMessage(message: GalaxyPointsResponse, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const { id, settings, count } = event.data;
  const points = generateGalaxyPoints(settings, count);
  scope.postMessage({ id, points }, [
    points.positions.buffer,
    points.colors.buffer,
    points.sizesLy.buffer,
  ]);
};
