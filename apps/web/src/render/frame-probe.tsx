import { useFrame } from '@react-three/fiber';
import { frameTimeline } from './diagnostics.ts';

/**
 * Counts rendered frames. React Three Fiber calls `useFrame` callbacks once for every frame it
 * renders, and with `frameloop="demand"` it renders only after something calls `invalidate()`.
 * So when nothing moves, this doesn't run at all, which is what the idle test checks.
 */
export function FrameProbe() {
  useFrame(() => {
    frameTimeline.record(performance.now());
  });
  return null;
}
