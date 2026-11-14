import {
  RICH_TEXT_POLICY,
  richTextTree,
  spoilerKeys,
  toPlainText,
  truncateRichNodes,
  type RichNode,
  type RichText,
} from '@ge/domain';
import { createElement, useMemo, useState, type ReactNode } from 'react';
import { Redactable } from './redactable.tsx';

interface RichTextViewProps {
  value: RichText | null | undefined;
  /** The field's `spoilerKeys.field` key; inline spoilers inside it are `<key>#0`, `#1`… */
  fieldKey: string;
  /** Inline content (a name): no paragraph spacing. */
  inline?: boolean;
  className?: string;
  /**
   * Shows only about this many characters at first, cut at a word, with "More" to show the
   * rest and "Less" to fold it again (the panel's description).
   */
  maxChars?: number;
}

/**
 * Renders a rich-text field in any of its three formats (architecture.md §9). The text goes
 * through `richTextTree` from @ge/domain, which keeps only what the policy allows, and becomes
 * React elements here; no HTML string ever reaches the page, so hostile markup can't run.
 * A whole-field spoiler and each inline spoiler become `<Redactable>`.
 */
export function RichTextView({ value, fieldKey, inline, className, maxChars }: RichTextViewProps) {
  const tree = useMemo(() => (value ? richTextTree(value) : []), [value]);
  const preview = useMemo(
    () => (maxChars === undefined ? null : truncateRichNodes(tree, maxChars)),
    [tree, maxChars],
  );
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;
  const folded = preview?.truncated === true && !expanded;
  const content = renderNodes(folded ? preview.nodes : tree, fieldKey);
  const body = inline ? (
    <span className={className}>{unwrapParagraphs(content, tree)}</span>
  ) : (
    <div className={['rich-text', className].filter(Boolean).join(' ')}>
      {content}
      {preview?.truncated && (
        <button
          type="button"
          aria-expanded={expanded}
          className="text-sm text-primary underline-offset-2 hover:underline"
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
  return (
    <Redactable
      flagged={value.spoiler}
      revealKey={fieldKey}
      hiddenText={toPlainText(value)}
      block={!inline}
    >
      {body}
    </Redactable>
  );
}

/** Names are one paragraph; inline, its content is shown without the paragraph. */
function unwrapParagraphs(content: ReactNode[], tree: readonly RichNode[]): ReactNode {
  const [first] = tree;
  if (tree.length === 1 && first?.type === 'element' && first.tag === 'p') {
    return renderNodes(first.children, '');
  }
  return content;
}

function renderNodes(nodes: readonly RichNode[], fieldKey: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, fieldKey, index));
}

function plainOf(nodes: readonly RichNode[]): string {
  return nodes.map((node) => (node.type === 'text' ? node.value : plainOf(node.children))).join('');
}

function renderNode(node: RichNode, fieldKey: string, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'spoiler':
      return (
        <InlineSpoiler key={key} node={node} fieldKey={fieldKey}>
          {renderNodes(node.children, fieldKey)}
        </InlineSpoiler>
      );
    case 'element': {
      const children = node.children.length > 0 ? renderNodes(node.children, fieldKey) : undefined;
      if (node.tag === 'a') {
        return (
          <a
            key={key}
            href={node.attributes.href}
            target={RICH_TEXT_POLICY.linkTarget}
            rel={RICH_TEXT_POLICY.linkRel}
          >
            {children}
          </a>
        );
      }
      if (node.tag === 'img') {
        return <img key={key} src={node.attributes.src} alt={node.attributes.alt ?? ''} />;
      }
      // Every other tag is allowed without attributes (richTextTree dropped them).
      return createElement(node.tag, { key }, children);
    }
  }
}

function InlineSpoiler({
  node,
  fieldKey,
  children,
}: {
  node: Extract<RichNode, { type: 'spoiler' }>;
  fieldKey: string;
  children: ReactNode;
}) {
  const key = spoilerKeys.inline(fieldKey, node.index);
  return (
    <Redactable flagged revealKey={key} hiddenText={plainOf(node.children)}>
      {children}
    </Redactable>
  );
}
