import { useBoxSelect } from '@/editor/use-box-select.ts';
import type { Mode } from './bindings.ts';
import { useKeyboard } from './use-keyboard.ts';
import { usePointerSelection } from './use-pointer-selection.ts';
import { useInputBindings } from './use-input-bindings.ts';

/**
 * Mouse, trackpad, touch and keyboard input for the canvas (ux.md §3–5): the camera, hover,
 * selection and, in edit mode, box selection. Lives inside the `<Canvas>`, next to
 * `<CameraControls>`; the mode comes from the editor store.
 */
export function InputBindings({ mode }: { mode: Mode }) {
  useInputBindings(mode);
  usePointerSelection(mode);
  useBoxSelect(mode);
  useKeyboard();
  return null;
}
