import { describe, expect, it } from 'vitest';
import { rt } from '../src/richtext/schema.ts';
import { richTextTree, type RichNode } from '../src/richtext/tree.ts';

/** The tree as compact markup, for readable expectations. */
function show(nodes: readonly RichNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'spoiler')
        return `[spoiler ${node.index.toString()}:${show(node.children)}]`;
      const attributes = Object.entries(node.attributes)
        .map(([name, value]) => ` ${name}="${value}"`)
        .join('');
      return `<${node.tag}${attributes}>${show(node.children)}</${node.tag}>`;
    })
    .join('');
}

describe('richTextTree', () => {
  it('splits plain text into paragraphs and lines', () => {
    expect(show(richTextTree(rt.plain('One\nline two\n\nNext')))).toBe(
      '<p>One<br></br>line two</p><p>Next</p>',
    );
  });

  it('renders Markdown with GFM and numbered inline spoilers', () => {
    const tree = richTextTree(rt.md('A **hive** world. ||Fell|| in ||312||.\n\n- one\n- ~~two~~'));
    expect(show(tree)).toBe(
      '<p>A <strong>hive</strong> world. [spoiler 0:Fell] in [spoiler 1:312].</p>' +
        '<ul><li><p>one</p></li><li><p><s>two</s></p></li></ul>',
    );
  });

  it('starts Markdown headings at h2 and keeps tables', () => {
    expect(show(richTextTree(rt.md('# Top\n\n| a | b |\n|---|---|\n| 1 | 2 |')))).toBe(
      '<h2>Top</h2><table><thead><tr><th>a</th><th>b</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
  });

  it('ignores raw HTML inside Markdown', () => {
    expect(show(richTextTree(rt.md('Hi <b onclick="x">there</b>')))).toBe('<p>Hi there</p>');
  });

  it('maps HTML spoiler spans, counting nested ones as part of the outer', () => {
    const tree = richTextTree(
      rt.html(
        '<p>The <span data-spoiler>Erebus <span data-spoiler>fleet</span></span> fell. <span data-spoiler>Twice.</span></p>',
      ),
    );
    expect(show(tree)).toBe('<p>The [spoiler 0:Erebus fleet] fell. [spoiler 1:Twice.]</p>');
  });

  it('keeps only allowed tags and attributes, so hostile HTML is inert', () => {
    const hostile = rt.html(
      '<p onclick="alert(1)" style="color:red">Hi<script>alert(2)</script>' +
        '<img src="x" onerror="alert(3)"><img src="/media/a.webp" onload="alert(4)" alt="A">' +
        '<a href="javascript:alert(5)">bad</a> <a href="https://example.com" onmouseover="alert(6)">good</a>' +
        '<iframe src="https://evil.example"></iframe><svg><script>alert(7)</script></svg>' +
        '<marquee>moving</marquee></p>',
    );
    const markup = show(richTextTree(hostile));
    expect(markup).toBe(
      '<p>Hi<img src="/media/a.webp" alt="A"></img>bad <a href="https://example.com">good</a>moving</p>',
    );
    expect(markup).not.toMatch(/alert|onerror|onclick|javascript|script|style/);
  });

  it('drops links and images the policy disallows in Markdown too', () => {
    expect(
      show(richTextTree(rt.md('[x](javascript:alert(1)) ![pic](https://elsewhere/a.png)'))),
    ).toBe('<p>x pic</p>');
  });
});
