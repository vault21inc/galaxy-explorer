import { redactHtmlSpoilers } from '../richtext/html.ts';
import { redactMarkdownSpoilers } from '../richtext/markdown.ts';
import { toPlainText } from '../richtext/plain-text.ts';
import { redactionBar } from '../richtext/redaction-bar.ts';
import type { RichText } from '../richtext/schema.ts';
import { isHidden, spoilerKeys, type SpoilerPolicy } from './policy.ts';

/**
 * A whole field blacked out: plain text made of `▇`, about as long as the original, still
 * marked as a spoiler. Nothing of the original text survives.
 */
export function blackedOut(text: RichText): RichText {
  return { format: 'plain', source: redactionBar(toPlainText(text)), spoiler: true };
}

/**
 * Applies the policy to one text field, whose key is `fieldKey` (see `spoilerKeys.field`):
 * - a hidden whole-field spoiler is blacked out;
 * - otherwise, each hidden inline spoiler's text is replaced by a bar, keeping its markers.
 * Returns the same object when nothing is hidden.
 */
export function redactRichText(text: RichText, policy: SpoilerPolicy, fieldKey = ''): RichText {
  if (isHidden(text.spoiler, fieldKey, policy)) return blackedOut(text);
  if (policy.showAll || text.format === 'plain') return text;

  const hide = (index: number) => isHidden(true, spoilerKeys.inline(fieldKey, index), policy);
  const source =
    text.format === 'markdown'
      ? redactMarkdownSpoilers(text.source, hide)
      : redactHtmlSpoilers(text.source, hide);
  return source === text.source ? text : { ...text, source };
}

/** `redactRichText` for optional fields. */
export function redactOptionalRichText<T extends RichText | null | undefined>(
  text: T,
  policy: SpoilerPolicy,
  fieldKey: string,
): T {
  return (text ? redactRichText(text, policy, fieldKey) : text) as T;
}

/**
 * Records carry `namePlain`, a plain-text copy of `name` for labels and sorting. When redaction
 * changed the name, the copy is rebuilt from the redacted name, or it would leak what the name
 * hides.
 */
export function syncPlainName(
  result: Record<string, unknown>,
  originalName: RichText | undefined,
): void {
  if ('namePlain' in result && result.name !== originalName && result.name) {
    result.namePlain = toPlainText(result.name as RichText);
  }
}
