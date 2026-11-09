/** Rounds a coordinate to the nearest multiple of the grid size (Shift while dragging). */
export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * The shift that moves `from` to `to`, snapped so the grabbed object lands on the grid: the
 * whole selection moves by the same amount and keeps its offsets (ux.md §5).
 */
export function moveDelta(
  grabbed: readonly [number, number, number],
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  gridSize: number | null,
): [number, number, number] {
  const delta: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  if (gridSize === null) return delta;
  return [
    snap(grabbed[0] + delta[0], gridSize) - grabbed[0],
    delta[1] === 0 ? 0 : snap(grabbed[1] + delta[1], gridSize) - grabbed[1],
    snap(grabbed[2] + delta[2], gridSize) - grabbed[2],
  ];
}
