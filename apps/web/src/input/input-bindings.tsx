import type { Mode } from './bindings.ts';
import { useCameraKeys } from './use-camera-keys.ts';
import { useInputBindings } from './use-input-bindings.ts';

/**
 * Mouse, trackpad, touch and keyboard input for the canvas (ux.md §3–4). Lives inside the
 * `<Canvas>`, next to `<CameraControls>`. The mode is 'view' until M3 adds edit mode.
 */
export function InputBindings({ mode }: { mode: Mode }) {
  useInputBindings(mode);
  useCameraKeys();
  return null;
}
