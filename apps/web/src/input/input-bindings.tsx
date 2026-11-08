import type { Mode } from './bindings.ts';
import { useKeyboard } from './use-keyboard.ts';
import { usePointerSelection } from './use-pointer-selection.ts';
import { useInputBindings } from './use-input-bindings.ts';

/**
 * Mouse, trackpad, touch and keyboard input for the canvas (ux.md §3–5): the camera, hover and
 * selection. Lives inside the
 * `<Canvas>`, next to `<CameraControls>`. The mode is 'view' until M3 adds edit mode.
 */
export function InputBindings({ mode }: { mode: Mode }) {
  useInputBindings(mode);
  usePointerSelection(mode);
  useKeyboard();
  return null;
}
