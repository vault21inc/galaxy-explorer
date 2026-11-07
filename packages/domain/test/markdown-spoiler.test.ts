import type { Nodes } from 'mdast';
import { describe, expect, it } from 'vitest';
import { markdownSpoilerSpans, parseMarkdown } from '../src/richtext/markdown.ts';

/** The text inside each top-level spoiler, in order. */
const spoilers = (source: string) => markdownSpoilerSpans(source).map((span) => span.text);

/** Every node type in the tree, to check what the parser built. */
function nodeTypes(source: string): string[] {
  const types: string[] = [];
  const visit = (node: Nodes) => {
    types.push(node.type);
    if ('children' in node) node.children.forEach(visit);
  };
  visit(parseMarkdown(source));
  return types;
}

describe('Markdown inline spoilers', () => {
  it.each([
    ['a ||hidden|| b', ['hidden']],
    ['||first|| and ||second||', ['first', 'second']],
    ['||whole line||', ['whole line']],
    ['||**bold** and _em_||', ['bold and em']],
    ['||a ||b|| c||', ['a b c']], // nested: one outer spoiler
    ['line one\n||line two||', ['line two']],
  ])('finds the spoilers in %j', (source, expected) => {
    expect(spoilers(source)).toEqual(expected);
  });

  it.each([
    ['escaped markers', '\\|\\|not hidden\\|\\|'],
    ['an unclosed opener', 'a ||not hidden'],
    ['an unopened closer', 'not hidden|| b'],
    ['a single pipe', 'a |not| b'],
    ['three pipes', '|||not hidden|||'],
    ['spaces inside the markers', '|| not hidden ||'],
    ['markers inside code', '`||not hidden||`'],
  ])('ignores %s', (_label, source) => {
    expect(spoilers(source)).toEqual([]);
  });

  it('builds a spoiler node holding the formatted children', () => {
    expect(nodeTypes('x ||**y**|| z')).toEqual([
      'root',
      'paragraph',
      'text',
      'spoiler',
      'strong',
      'text',
      'text',
    ]);
  });

  it('records where each spoiler is in the source, markers included', () => {
    const source = 'ab ||cd|| ef';
    const [span] = markdownSpoilerSpans(source);
    expect(span && source.slice(span.start, span.end)).toBe('||cd||');
  });
});
