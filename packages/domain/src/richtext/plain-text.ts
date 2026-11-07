import { htmlToPlainText } from './html.ts';
import { markdownToPlainText } from './markdown.ts';
import { redactionBar } from './redaction-bar.ts';
import type { RichText } from './schema.ts';
import { normalizeLines } from './text-lines.ts';

export interface PlainTextOptions {
  /** Replace spoiler text with redaction bars: the whole field if it's flagged, else each inline spoiler. */
  redactSpoilers?: boolean;
}

/**
 * The plain text of a rich text value. It's what 3D labels, sorting, breadcrumbs and search
 * use (`name_plain`), so the same function runs on the server and in the browser.
 */
export function toPlainText(text: RichText, options: PlainTextOptions = {}): string {
  const redact = options.redactSpoilers ?? false;
  const hide = () => redact;
  const plain =
    text.format === 'markdown'
      ? markdownToPlainText(text.source, hide)
      : text.format === 'html'
        ? htmlToPlainText(text.source, hide)
        : normalizeLines(text.source);
  return redact && text.spoiler ? redactionBar(plain) : plain;
}
