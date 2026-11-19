import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { capturing } from '@/state/capture.ts';
import { useQuality } from '@/state/quality.ts';
import { FrameRateGuard } from './frame-rate-guard.ts';
import { pacedIntervalMs } from './frame-pacing.ts';
import { QUALITY_FLOOR_FPS, QUALITY_PACED_SLACK, QUALITY_WINDOW_MS } from './tuning.ts';

/**
 * Steps the quality down when the frame rate stays low (rendering.md §13), inside the canvas.
 *
 * Off under automation (`navigator.webdriver`): end-to-end tests run in software rendering at
 * a few frames per second and would trip it, and `pnpm perf` must measure the default quality.
 */
export function QualityGuard() {
  const guard = useRef<FrameRateGuard | null>(null);
  const last = useRef(0);
  const automated = typeof navigator !== 'undefined' && navigator.webdriver;

  useFrame(() => {
    // Nor while capturing (D-55): a quality change mid-clip would show in the recording.
    if (automated || capturing()) return;
    guard.current ??= new FrameRateGuard(QUALITY_FLOOR_FPS, QUALITY_WINDOW_MS, QUALITY_PACED_SLACK);
    const now = performance.now();
    const interval = now - last.current;
    last.current = now;
    // Frames a timer asks for on purpose (ambient motion) aren't slow frames.
    if (guard.current.record(interval, pacedIntervalMs())) useQuality.getState().stepDown();
  });
  return null;
}
