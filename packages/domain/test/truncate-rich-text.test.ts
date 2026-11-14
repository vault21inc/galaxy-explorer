import { describe, expect, it } from 'vitest';
import { richTextTree, truncateRichNodes } from '../src/richtext/index.ts';
import { rt } from '../src/richtext/schema.ts';

/** Previews of long text (the info panel's description and its "More"). */

const plainOf = (nodes: ReturnType<typeof richTextTree>): string =>
  nodes.map((node) => (node.type === 'text' ? node.value : plainOf(node.children))).join('');

describe('truncateRichNodes', () => {
  it('cuts at a word near the limit, keeping formatting, and drops what follows', () => {
    const tree = richTextTree(
      rt.md('The **Cadian Gate** is an area of calm space.\n\nIt is therefore a site of raids.'),
    );
    const { nodes, truncated } = truncateRichNodes(tree, 20);
    expect(truncated).toBe(true);
    expect(plainOf(nodes)).toBe('The Cadian Gate is…');
    // One paragraph left, with the bold kept.
    expect(nodes).toHaveLength(1);
    expect(JSON.stringify(nodes)).toContain('"tag":"strong"');
  });

  it('leaves text alone that is only a little over the limit', () => {
    const tree = richTextTree(rt.plain('Twenty-two characters.'));
    expect(truncateRichNodes(tree, 20)).toEqual({ nodes: tree, truncated: false });
    expect(truncateRichNodes(tree, 10).truncated).toBe(true);
  });

  it('cuts inside a spoiler without losing it', () => {
    const tree = richTextTree(
      rt.md('Heretics ||hide in the hives of the upper spires|| of Gudrun.'),
    );
    const { nodes } = truncateRichNodes(tree, 25);
    expect(JSON.stringify(nodes)).toContain('"type":"spoiler"');
    expect(plainOf(nodes)).toBe('Heretics hide in the…');
  });
});
