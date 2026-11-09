/**
 * "Mark as spoiler" (ux.md §8): wraps the selected text in the format's inline spoiler,
 * `||…||` in Markdown and `<span data-spoiler>…</span>` in HTML. Pressed again on text that is
 * already wrapped, it unwraps it. Pure, so it's unit-tested apart from any editor.
 */

export interface TextSelection {
  from: number;
  to: number;
}

/** A replacement of the whole text, and where the selection goes afterwards. */
export interface TextEdit {
  source: string;
  selection: TextSelection;
}

const MARKERS = {
  markdown: { open: '||', close: '||' },
  html: { open: '<span data-spoiler>', close: '</span>' },
} as const;

export type SpoilerFormat = keyof typeof MARKERS;

export function markSpoiler(
  source: string,
  selection: TextSelection,
  format: SpoilerFormat,
): TextEdit {
  const { open, close } = MARKERS[format];
  let from = Math.min(selection.from, selection.to);
  let to = Math.max(selection.from, selection.to);
  // Markers must touch the text: `|| x ||`, with spaces inside, isn't a spoiler in Markdown
  // (markdown-spoiler.ts). So whitespace at the selection's edges stays outside.
  while (from < to && /\s/.test(source.charAt(from))) from++;
  while (to > from && /\s/.test(source.charAt(to - 1))) to--;

  const wrapped =
    from - open.length >= 0 &&
    source.slice(from - open.length, from) === open &&
    source.slice(to, to + close.length) === close;
  if (wrapped && from < to) {
    return {
      source:
        source.slice(0, from - open.length) +
        source.slice(from, to) +
        source.slice(to + close.length),
      selection: { from: from - open.length, to: to - open.length },
    };
  }

  // An empty selection inserts an empty spoiler with the cursor inside, ready to type.
  return {
    source: source.slice(0, from) + open + source.slice(from, to) + close + source.slice(to),
    selection: { from: from + open.length, to: to + open.length },
  };
}
