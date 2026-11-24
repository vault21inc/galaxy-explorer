import { REDACTION_CHAR, toPlainText, type RichText } from '@ge/domain';

/**
 * Text for the pages that fetchers and crawlers read (M8-T9, D-62): plain, with no spoiler in
 * it. A spoiler is left out, with an ellipsis in its place, never a bar that hints at its
 * length.
 */

/** A card's text is cut at about this many characters, at a word. */
const CARD_MAX_CHARS = 200;

/** A page's whole text is cut at about this many: enough for any entry's description. */
const BODY_MAX_CHARS = 6_000;

/** Plain text with no spoiler in it, or null if any part is one (it's left out whole). */
export function spoilerFree(text: RichText | null): string | null {
  if (!text) return null;
  const plain = toPlainText(text, { redactSpoilers: true }).trim();
  return plain === '' || plain.includes(REDACTION_CHAR) ? null : plain;
}

/** A card's line of text: the plain text, spoilers dropped, cut at a word near the limit. */
export function cardText(text: RichText | null): string | null {
  const plain = paragraphs(text).join(' ');
  return plain === '' ? null : cut(plain, CARD_MAX_CHARS);
}

/**
 * A page's whole text, a paragraph a line (`toPlainText` puts each block on a line of its
 * own), spoilers dropped. What a search engine indexes, so as much as there is, up to a limit.
 */
export function bodyText(texts: readonly (RichText | null)[]): string[] {
  const kept: string[] = [];
  let left = BODY_MAX_CHARS;
  for (const paragraph of texts.flatMap(paragraphs)) {
    if (left <= 0) break;
    const text = cut(paragraph, left);
    kept.push(text);
    left -= text.length;
  }
  return kept;
}

function paragraphs(text: RichText | null): string[] {
  if (!text) return [];
  return toPlainText(text, { redactSpoilers: true })
    .replace(new RegExp(`\\s*${REDACTION_CHAR}+\\s*`, 'g'), ' … ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '' && line !== '…');
}

/** `text`, or its start cut at a word near `maxChars`, with an ellipsis. */
function cut(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const start = text.slice(0, maxChars);
  const space = start.lastIndexOf(' ');
  return `${(space > maxChars / 2 ? start.slice(0, space) : start).trimEnd()}…`;
}
