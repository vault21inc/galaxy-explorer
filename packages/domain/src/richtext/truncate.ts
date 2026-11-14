import type { RichNode } from './tree.ts';

/**
 * A rich-text tree cut to about `maxChars` characters of text, for a preview with "More" (the
 * info panel's description). The formatting up to the cut is kept: bold stays bold, a link
 * stays a link. The cut falls at the end of a word, with "…" after it, and everything after it
 * is left out.
 *
 * Text that is only a little longer than the limit (up to `slack` times it) isn't cut: hiding
 * a line behind "More" saves nothing.
 */
export function truncateRichNodes(
  nodes: readonly RichNode[],
  maxChars: number,
  slack = 1.2,
): { nodes: RichNode[]; truncated: boolean } {
  if (textLength(nodes) <= maxChars * slack) return { nodes: [...nodes], truncated: false };
  let budget = maxChars;
  let done = false;

  const cut = (list: readonly RichNode[]): RichNode[] => {
    const kept: RichNode[] = [];
    for (const node of list) {
      if (done) break;
      if (node.type === 'text') {
        if (node.value.length <= budget) {
          kept.push(node);
          budget -= node.value.length;
        } else {
          kept.push({ type: 'text', value: `${wordCut(node.value, budget)}…` });
          done = true;
        }
        continue;
      }
      const children = cut(node.children);
      // An element with nothing left in it (an empty paragraph after the cut) is dropped.
      if (children.length > 0 || node.children.length === 0) kept.push({ ...node, children });
    }
    return kept;
  };
  return { nodes: cut(nodes), truncated: true };
}

function textLength(nodes: readonly RichNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + (node.type === 'text' ? node.value.length : textLength(node.children)),
    0,
  );
}

/** The text up to `length` characters, ending at the last whole word before it. */
function wordCut(text: string, length: number): string {
  const head = text.slice(0, length);
  const lastSpace = head.search(/\s\S*$/);
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd();
}
