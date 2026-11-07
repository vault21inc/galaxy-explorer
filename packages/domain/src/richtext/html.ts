import type { ChildNode, Element } from 'domhandler';
import { isTag, isText } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import type { HideSpoiler, SpoilerSpan } from './markdown.ts';
import { redactionBar } from './redaction-bar.ts';
import { CELL_SEPARATOR, normalizeLines } from './text-lines.ts';

/** Elements that start a new line in plain text. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'ul',
]);

/** Elements whose content is never text. */
const SKIPPED_TAGS = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object']);

function parse(source: string) {
  return parseDocument(source, { withStartIndices: true, withEndIndices: true });
}

function isSpoilerSpan(element: Element): boolean {
  return element.name === 'span' && 'data-spoiler' in element.attribs;
}

/**
 * The text of an HTML fragment: text nodes only, with block elements on their own lines and
 * table cells joined by ` | `. Hidden inline spoilers (`<span data-spoiler>`) become a bar.
 */
export function htmlToPlainText(source: string, hideSpoiler: HideSpoiler): string {
  const counter = { next: 0 };
  return normalizeLines(nodesText(parse(source).children, hideSpoiler, counter, false));
}

/** Where the content of each top-level spoiler span is in the source. */
export function htmlSpoilerSpans(source: string): SpoilerSpan[] {
  const spans: SpoilerSpan[] = [];
  const visit = (node: ChildNode): void => {
    if (!isTag(node)) return;
    if (isSpoilerSpan(node)) {
      const first = node.children[0];
      const last = node.children.at(-1);
      if (first?.startIndex != null && last?.endIndex != null) {
        spans.push({
          start: first.startIndex,
          end: last.endIndex + 1,
          text: nodesText(node.children, () => false, { next: 0 }, false),
        });
      }
      return; // nested spoiler spans belong to this one
    }
    node.children.forEach(visit);
  };
  parse(source).children.forEach(visit);
  return spans;
}

/**
 * Replaces the content of hidden spoiler spans with a redaction bar. The span itself stays, so
 * a renderer still shows it as redacted; the rest of the source stays byte for byte.
 */
export function redactHtmlSpoilers(source: string, hideSpoiler: HideSpoiler): string {
  const spans = htmlSpoilerSpans(source);
  let result = source;
  for (let index = spans.length - 1; index >= 0; index--) {
    const span = spans[index];
    if (!span || !hideSpoiler(index)) continue;
    result = result.slice(0, span.start) + redactionBar(span.text) + result.slice(span.end);
  }
  return result;
}

function nodesText(
  nodes: readonly ChildNode[],
  hide: HideSpoiler,
  counter: { next: number },
  preformatted: boolean,
): string {
  return nodes.map((node) => nodeText(node, hide, counter, preformatted)).join('');
}

function nodeText(
  node: ChildNode,
  hide: HideSpoiler,
  counter: { next: number },
  preformatted: boolean,
): string {
  if (isText(node)) {
    // Outside <pre>, HTML collapses runs of whitespace, including line breaks, to one space.
    return preformatted ? node.data : node.data.replace(/\s+/g, ' ');
  }
  if (!isTag(node) || SKIPPED_TAGS.has(node.name)) return '';

  if (isSpoilerSpan(node)) {
    const index = counter.next++;
    const text = nodesText(node.children, () => false, { next: 0 }, preformatted);
    return hide(index) ? redactionBar(text) : text;
  }
  if (node.name === 'br') return '\n';
  if (node.name === 'img') return node.attribs.alt ?? '';
  if (node.name === 'tr') {
    const cells = node.children.filter((child) => isTag(child));
    return `\n${cells.map((cell) => nodeText(cell, hide, counter, preformatted).trim()).join(CELL_SEPARATOR)}\n`;
  }

  const inner = nodesText(node.children, hide, counter, preformatted || node.name === 'pre');
  return BLOCK_TAGS.has(node.name) ? `\n${inner}\n` : inner;
}
