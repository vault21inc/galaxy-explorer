/**
 * The on-screen size clamp the body shader applies (rendering.md §6), on the CPU, for the test
 * hooks and the picker (M2-T5). Keep it in step with InstancedBodies' vertex shader.
 *
 * `worldPerPxAt1` comes from `worldPerPxAt1()` (screen-scale.ts); `depth` is the distance in
 * front of the camera, along its view direction.
 */
export function clampedRadiusPx(
  radius: number,
  depth: number,
  worldPerPxAt1: number,
  minRadiusPx: number,
  maxRadiusPx: number,
): number {
  const radiusPx = radius / (worldPerPxAt1 * Math.max(depth, 1e-3));
  return Math.min(Math.max(radiusPx, minRadiusPx), maxRadiusPx);
}
