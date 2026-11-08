import type { Camera } from 'three';

/**
 * World units per CSS pixel at a distance of 1 from the camera (rendering.md §6). At distance
 * d, one pixel covers `d × this` world units, so a shader can turn a world size into pixels
 * and clamp it. A perspective camera sees `2 × tan(fov / 2)` units of height at distance 1,
 * spread over the viewport's height in pixels.
 */
export function worldPerPxAt1(camera: Camera, viewportHeightPx: number): number {
  const fovDeg = 'fov' in camera && typeof camera.fov === 'number' ? camera.fov : 45;
  return (2 * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(viewportHeightPx, 1);
}
