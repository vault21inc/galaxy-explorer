import type { Nodes as MdastNodes } from 'mdast';
import type { ChildNode } from 'domhandler';
import { isTag, isText } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { parseMarkdown } from './markdown.ts';
import { isAllowedImageSource, isAllowedLinkUrl, RICH_TEXT_POLICY } from './policy.ts';
import type { RichText } from './schema.ts';

/**
 * Rich text as a small tree that only holds what the policy allows (architecture.md §9). The web
 * app renders this tree as React elements, and never sets HTML directly: anything the tree
 * can't express (scripts, event handlers, `javascript:` links, unknown tags) simply can't
 * reach the page. All three formats produce the same tree, so there's one renderer.
 *
 * Inline spoilers become `spoiler` nodes numbered 0, 1, … in document order. A spoiler inside
 * another belongs to the outer one, as in `markdownToPlainText`, so the numbers match
 * `spoilerKeys.inline` everywhere.
 */
export type RichTag = (typeof RICH_TEXT_POLICY.allowedTags)[number];

export type RichNode =
  | { type: 'text'; value: string }
  | {
      type: 'element';
      tag: RichTag;
      attributes: Readonly<Record<string, string>>;
      children: RichNode[];
    }
  | { type: 'spoiler'; index: number; children: RichNode[] };

export function richTextTree(text: RichText): RichNode[] {
  switch (text.format) {
    case 'plain':
      return plainTree(text.source);
    case 'markdown':
      return markdownTree(text.source);
    case 'html':
      return htmlTree(text.source);
  }
}

const element = (
  tag: RichTag,
  children: RichNode[],
  attributes: Record<string, string> = {},
): RichNode => ({ type: 'element', tag, attributes, children });

// ---- plain ---------------------------------------------------------------------------------

/** Paragraphs at blank lines; single line breaks stay as `<br>`. */
function plainTree(source: string): RichNode[] {
  return source
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) =>
      element(
        'p',
        paragraph.split('\n').flatMap((line, index): RichNode[] => {
          const text: RichNode = { type: 'text', value: line };
          return index === 0 ? [text] : [element('br', []), text];
        }),
      ),
    );
}

// ---- Markdown ------------------------------------------------------------------------------

function markdownTree(source: string): RichNode[] {
  const counter = { next: 0 };
  return parseMarkdown(source).children.flatMap((node) => fromMdast(node, counter, false));
}

const HEADINGS: Record<number, RichTag> = { 1: 'h2', 2: 'h2', 3: 'h3' };

function fromMdast(node: MdastNodes, counter: { next: number }, inSpoiler: boolean): RichNode[] {
  const children = (nodes: readonly MdastNodes[], nested = inSpoiler) =>
    nodes.flatMap((child) => fromMdast(child, counter, nested));
  switch (node.type) {
    case 'text':
      return [{ type: 'text', value: node.value }];
    case 'paragraph':
      return [element('p', children(node.children))];
    case 'heading':
      // Headings start at h2: the panel's title is the page's h1-level heading.
      return [element(HEADINGS[node.depth] ?? 'h4', children(node.children))];
    case 'emphasis':
      return [element('em', children(node.children))];
    case 'strong':
      return [element('strong', children(node.children))];
    case 'delete':
      return [element('s', children(node.children))];
    case 'inlineCode':
      return [element('code', [{ type: 'text', value: node.value }])];
    case 'code':
      return [element('pre', [element('code', [{ type: 'text', value: node.value }])])];
    case 'break':
      return [element('br', [])];
    case 'thematicBreak':
      return [element('hr', [])];
    case 'blockquote':
      return [element('blockquote', children(node.children))];
    case 'list':
      return [element(node.ordered ? 'ol' : 'ul', children(node.children))];
    case 'listItem':
      return [element('li', children(node.children))];
    case 'link':
      // A disallowed URL keeps its text and loses the link.
      return isAllowedLinkUrl(node.url)
        ? [element('a', children(node.children), { href: node.url })]
        : children(node.children);
    case 'image':
      return isAllowedImageSource(node.url)
        ? [element('img', [], { src: node.url, alt: node.alt ?? '' })]
        : node.alt
          ? [{ type: 'text', value: node.alt }]
          : [];
    case 'table': {
      const [head, ...body] = node.children;
      const row = (cells: readonly MdastNodes[], tag: 'th' | 'td') =>
        element(
          'tr',
          cells.map((cell) =>
            element(tag, 'children' in cell ? children(cell.children as MdastNodes[]) : []),
          ),
        );
      return [
        element('table', [
          ...(head ? [element('thead', [row(head.children, 'th')])] : []),
          ...(body.length > 0
            ? [
                element(
                  'tbody',
                  body.map((r) => row(r.children, 'td')),
                ),
              ]
            : []),
        ]),
      ];
    }
    case 'spoiler': {
      // Nested spoilers are part of the outer one, which has the number.
      if (inSpoiler) return children(node.children, true);
      const index = counter.next++;
      return [{ type: 'spoiler', index, children: children(node.children, true) }];
    }
    case 'linkReference':
    case 'imageReference':
      return 'children' in node ? children(node.children) : [];
    default:
      // Raw HTML inside Markdown, definitions and footnotes are left out (`skipHtml`).
      return [];
  }
}

// ---- HTML ----------------------------------------------------------------------------------

/** Elements whose content must never show as text either. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'textarea',
  'title',
  'head',
]);
const ALLOWED_TAGS = new Set<string>(RICH_TEXT_POLICY.allowedTags);

function htmlTree(source: string): RichNode[] {
  const counter = { next: 0 };
  return parseDocument(source).children.flatMap((node) => fromHtml(node, counter, false));
}

function fromHtml(node: ChildNode, counter: { next: number }, inSpoiler: boolean): RichNode[] {
  if (isText(node)) return [{ type: 'text', value: node.data }];
  if (!isTag(node)) return []; // comments, directives
  const name = node.name.toLowerCase();
  if (DROP_WITH_CONTENT.has(name)) return [];
  const isSpoiler = name === 'span' && 'data-spoiler' in node.attribs;
  const children = node.children.flatMap((child) =>
    fromHtml(child, counter, inSpoiler || isSpoiler),
  );
  if (isSpoiler) {
    if (inSpoiler) return children;
    return [{ type: 'spoiler', index: counter.next++, children }];
  }
  // A tag the policy doesn't allow is unwrapped: its text stays, the tag and attributes go.
  if (!ALLOWED_TAGS.has(name)) return children;
  const tag = name as RichTag;
  if (tag === 'a') {
    const href = node.attribs.href;
    return href !== undefined && isAllowedLinkUrl(href)
      ? [element('a', children, { href })]
      : children;
  }
  if (tag === 'img') {
    const src = node.attribs.src;
    return src !== undefined && isAllowedImageSource(src)
      ? [element('img', [], { src, alt: node.attribs.alt ?? '' })]
      : [];
  }
  // No other attribute survives.
  return [element(tag, children)];
}
