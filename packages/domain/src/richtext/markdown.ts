import type { Nodes, PhrasingContent, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { remarkSpoiler } from './markdown-spoiler.ts';
import { redactionBar } from './redaction-bar.ts';
import { CELL_SEPARATOR, normalizeLines } from './text-lines.ts';

/**
 * Markdown as this app reads it: CommonMark plus GFM (tables, strikethrough, autolinks) plus
 * inline spoilers (`||…||`). Raw HTML inside Markdown is ignored, as the renderer ignores it
 * (architecture.md §9).
 */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkSpoiler);

export function parseMarkdown(source: string): Root {
  return parser.parse(source);
}

/** Decides, by its position among the field's inline spoilers (0, 1, …), whether one is hidden. */
export type HideSpoiler = (index: number) => boolean;

/**
 * The text of a Markdown document, one line per paragraph, heading, list item, table row or
 * code line. Links keep their text, images their alt text. Hidden inline spoilers become a
 * redaction bar.
 */
export function markdownToPlainText(source: string, hideSpoiler: HideSpoiler): string {
  const counter = { next: 0 };
  return normalizeLines(blockLines(parseMarkdown(source), hideSpoiler, counter).join('\n'));
}

/** Where each top-level inline spoiler is in the source, including its `||` markers. */
export interface SpoilerSpan {
  start: number;
  end: number;
  text: string;
}

export function markdownSpoilerSpans(source: string): SpoilerSpan[] {
  const spans: SpoilerSpan[] = [];
  const visit = (node: Nodes): void => {
    if (node.type === 'spoiler') {
      const { start, end } = node.position ?? {};
      if (start?.offset !== undefined && end?.offset !== undefined) {
        spans.push({
          start: start.offset,
          end: end.offset,
          text: inlineText(node.children, () => false, { next: 0 }),
        });
      }
      return; // nested spoilers belong to this one
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(parseMarkdown(source));
  return spans;
}

/**
 * Replaces the text inside hidden spoilers with a redaction bar, keeping the `||` markers so a
 * renderer still shows them as redacted. Everything else in the source stays byte for byte.
 */
export function redactMarkdownSpoilers(source: string, hideSpoiler: HideSpoiler): string {
  const spans = markdownSpoilerSpans(source);
  let result = source;
  // From the end, so earlier offsets stay valid.
  for (let index = spans.length - 1; index >= 0; index--) {
    const span = spans[index];
    if (!span || !hideSpoiler(index)) continue;
    const markerLength = 2;
    result =
      result.slice(0, span.start + markerLength) +
      redactionBar(span.text) +
      result.slice(span.end - markerLength);
  }
  return result;
}

function blockLines(node: Nodes, hide: HideSpoiler, counter: { next: number }): string[] {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return [inlineText(node.children, hide, counter)];
    case 'code':
      return node.value.split('\n');
    case 'table':
      return node.children.map((row) =>
        row.children.map((cell) => inlineText(cell.children, hide, counter)).join(CELL_SEPARATOR),
      );
    case 'html':
    case 'thematicBreak':
    case 'definition':
      return [];
    default:
      return 'children' in node
        ? node.children.flatMap((child) => blockLines(child, hide, counter))
        : [];
  }
}

function inlineText(
  nodes: readonly PhrasingContent[],
  hide: HideSpoiler,
  counter: { next: number },
): string {
  return nodes.map((node) => inlineNodeText(node, hide, counter)).join('');
}

function inlineNodeText(
  node: PhrasingContent,
  hide: HideSpoiler,
  counter: { next: number },
): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value;
    case 'break':
      return '\n';
    case 'image':
    case 'imageReference':
      return node.alt ?? '';
    case 'html':
    case 'footnoteReference':
      return '';
    case 'spoiler': {
      const index = counter.next++;
      // Spoilers nested inside this one are part of it, so they don't take an index.
      const text = inlineText(node.children, () => false, { next: 0 });
      return hide(index) ? redactionBar(text) : text;
    }
    default:
      return inlineText(node.children, hide, counter);
  }
}
