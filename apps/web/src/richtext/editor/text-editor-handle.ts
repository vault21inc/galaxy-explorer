import type { TextEdit, TextSelection } from './spoiler-wrap.ts';

/**
 * What the rich-text field needs from whichever editor is showing (a single-line input, a
 * textarea, or CodeMirror): read the selection, and replace the text keeping a selection. So
 * "Mark as spoiler" works the same in all of them.
 */
export interface TextEditorHandle {
  selection(): TextSelection;
  apply(edit: TextEdit): void;
  focus(): void;
}

/** The handle of an `<input>` or `<textarea>`. */
export function nativeHandle(
  element: HTMLInputElement | HTMLTextAreaElement,
  onChange: (source: string) => void,
): TextEditorHandle {
  return {
    selection: () => ({ from: element.selectionStart ?? 0, to: element.selectionEnd ?? 0 }),
    apply: (edit) => {
      onChange(edit.source);
      // React writes the new value on its next render; set it now so the selection fits it.
      element.value = edit.source;
      element.setSelectionRange(edit.selection.from, edit.selection.to);
      element.focus();
    },
    focus: () => {
      element.focus();
    },
  };
}
