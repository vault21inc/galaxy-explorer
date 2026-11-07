import { describe, expect, it } from 'vitest';
import { rt, toPlainText } from '../src/richtext/index.ts';

describe('toPlainText', () => {
  describe('plain', () => {
    it('keeps the text, trimming lines and dropping blank ones', () => {
      expect(toPlainText(rt.plain('  Gudrun  \n\n  System '))).toBe('Gudrun\nSystem');
    });
  });

  describe('markdown', () => {
    it.each([
      [
        'paragraphs and headings',
        '## Title\n\nFirst para.\n\nSecond *para*.',
        'Title\nFirst para.\nSecond para.',
      ],
      ['lists, nested', '- one\n- two\n  - two a\n1. three', 'one\ntwo\ntwo a\nthree'],
      ['links keep their text', 'See [the wiki](https://example.com) now', 'See the wiki now'],
      ['autolinks keep the URL', 'Visit https://example.com', 'Visit https://example.com'],
      [
        'images keep their alt text',
        'A ![map of Gudrun](/media/x.png) here',
        'A map of Gudrun here',
      ],
      ['tables, one row per line', '| a | b |\n|---|---|\n| 1 | 2 |', 'a | b\n1 | 2'],
      ['hard line breaks', 'line one\\\nline two  \nline three', 'line one\nline two\nline three'],
      ['soft line breaks stay in the line', 'one\ntwo', 'one\ntwo'],
      ['code blocks and inline code', 'Run `pnpm dev`\n\n```\na\nb\n```', 'Run pnpm dev\na\nb'],
      ['strikethrough and emphasis', '~~old~~ **new** _now_', 'old new now'],
      ['raw HTML is dropped', 'a <b>bold</b> b\n\n<div>block</div>', 'a bold b'],
      ['quotes', '> quoted\n> text', 'quoted\ntext'],
    ])('%s', (_label, source, expected) => {
      expect(toPlainText(rt.md(source))).toBe(expected);
    });
  });

  describe('html', () => {
    it.each([
      [
        'paragraphs and headings',
        '<h2>Title</h2><p>First</p><p>Second</p>',
        'Title\nFirst\nSecond',
      ],
      [
        'lists, nested',
        '<ul><li>one</li><li>two<ul><li>two a</li></ul></li></ul>',
        'one\ntwo\ntwo a',
      ],
      [
        'links keep their text',
        '<p>See <a href="https://example.com">the wiki</a></p>',
        'See the wiki',
      ],
      [
        'images keep their alt text',
        '<p>A <img src="/media/x.png" alt="map"> here</p>',
        'A map here',
      ],
      [
        'tables, one row per line',
        '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>',
        'a | b\n1 | 2',
      ],
      ['line breaks', '<p>one<br>two</p>', 'one\ntwo'],
      ['whitespace collapses outside pre', '<p>a\n   b</p><pre>x\ny</pre>', 'a b\nx\ny'],
      ['entities are decoded', '<p>Tom &amp; Jerry &lt;3</p>', 'Tom & Jerry <3'],
      [
        'scripts and styles are dropped',
        '<p>a</p><script>alert(1)</script><style>p{}</style>',
        'a',
      ],
    ])('%s', (_label, source, expected) => {
      expect(toPlainText(rt.html(source))).toBe(expected);
    });
  });

  describe('spoilers', () => {
    it('shows spoiler text unless asked to redact', () => {
      expect(toPlainText(rt.md('a ||secret|| b'))).toBe('a secret b');
      expect(toPlainText(rt.plain('Secret', { spoiler: true }))).toBe('Secret');
    });

    it.each([
      [
        'markdown',
        rt.md('The traitor is ||Inquisitor Eisenhorn||.'),
        'The traitor is ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇.',
      ],
      ['markdown, escaped', rt.md('a \\|\\|b\\|\\| c'), 'a ||b|| c'],
      ['markdown, unclosed', rt.md('a ||b c'), 'a ||b c'],
      [
        'html',
        rt.html('<p>The traitor is <span data-spoiler>Eisenhorn</span>.</p>'),
        'The traitor is ▇▇▇▇▇▇▇▇▇.',
      ],
      [
        'html, nested spans count as one',
        rt.html('<p><span data-spoiler>a <span data-spoiler>b</span> c</span></p>'),
        '▇▇▇▇▇▇',
      ],
      ['a whole flagged field', rt.plain('Gudrun', { spoiler: true }), '▇▇▇▇▇▇'],
    ])('redacts %s', (_label, text, expected) => {
      expect(toPlainText(text, { redactSpoilers: true })).toBe(expected);
    });
  });
});
