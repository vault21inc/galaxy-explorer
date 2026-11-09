import { useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import type { InstancedBufferAttribute, InstancedBufferGeometry, Mesh } from 'three';
import { movePreview, onMovePreview } from './scene-index.ts';

/** Which instances belong to each object: [first, count] in the instance buffers. */
export type InstanceRanges = ReadonlyMap<string, readonly [first: number, count: number]>;

/**
 * Applies a move in progress (M3-T3) to an instanced renderer: the moving objects' instance
 * centers (`aCenter`) are shifted by the preview's delta, and put back from `baseCenters` when
 * it ends. Only those instances change; the attribute is uploaded again, which for 5,000
 * objects is 60 kB, cheap next to rebuilding the buffers.
 */
export function useMovePreview(
  mesh: RefObject<Mesh<InstancedBufferGeometry> | null>,
  ranges: InstanceRanges,
  baseCenters: Float32Array,
): void {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let shifted: (readonly [number, number])[] = [];
    const apply = () => {
      const centers = mesh.current?.geometry.getAttribute('aCenter') as
        InstancedBufferAttribute | undefined;
      if (!centers) return;
      const array = centers.array as Float32Array;
      // Put back what the last preview moved.
      for (const [first, count] of shifted) {
        array.set(baseCenters.subarray(first * 3, (first + count) * 3), first * 3);
      }
      shifted = [];
      const preview = movePreview();
      if (preview) {
        const [dx, dy, dz] = preview.delta;
        for (const id of preview.ids) {
          const range = ranges.get(id);
          if (!range) continue;
          const [first, count] = range;
          for (let i = first; i < first + count; i++) {
            array[i * 3] = (baseCenters[i * 3] ?? 0) + dx;
            array[i * 3 + 1] = (baseCenters[i * 3 + 1] ?? 0) + dy;
            array[i * 3 + 2] = (baseCenters[i * 3 + 2] ?? 0) + dz;
          }
          shifted.push(range);
        }
      }
      centers.needsUpdate = true;
      invalidate();
    };
    apply();
    return onMovePreview(apply);
  }, [mesh, ranges, baseCenters, invalidate]);
}
