import { FactWrite, rt, schemasFor } from '@ge/domain';
import { HTML_XSS_CORPUS } from '@ge/domain/testing';
import { describe, expect, it } from 'vitest';
import { sanitizeHtmlSource, sanitizeRichTextFields } from '../src/services/sanitize.ts';

/**
 * The XSS corpus (M1-T5, @ge/domain/testing): each payload must come out harmless. "Harmless" is
 * checked structurally: no script, no event handler, no style, no dangerous URL, no SVG or
 * MathML. The e2e test xss.spec.ts plants the same payloads and checks the rendered pages.
 */
const corpus = HTML_XSS_CORPUS;

/** Signs of executable or styling content left in sanitized HTML. */
const DANGER = [
  /<script/i,
  /<style/i,
  /<svg/i,
  /<math/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<form/i,
  /<input/i,
  /<meta/i,
  /<base/i,
  /\son[a-z]+\s*=/i,
  /\sstyle\s*=/i,
  /\ssrcset\s*=/i,
  /\starget\s*=/i,
  /href\s*=\s*"(?!https?:\/\/|\/(?![/\\])|#|mailto:)/i,
  /src\s*=\s*"(?!\/media\/)/i,
  /javascript:/i,
  /vbscript:/i,
  /data:/i,
];

describe('HTML sanitizing (XSS corpus)', () => {
  it.each(corpus)('neutralizes: %s', (_label, payload) => {
    const clean = sanitizeHtmlSource(payload);
    for (const pattern of DANGER)
      expect(clean, `${String(pattern)} in ${clean}`).not.toMatch(pattern);
  });

  it('keeps everything the policy allows', () => {
    const html =
      '<h2>Title</h2><p><strong>b</strong> <em>i</em> <b>b</b> <i>i</i> <u>u</u> <s>s</s> <code>c</code></p>' +
      '<blockquote>q</blockquote><ul><li>one</li></ul><ol><li>two</li></ol>' +
      '<p><a href="https://example.com/x">link</a> <a href="/u/a/b">local</a> <a href="mailto:a@b.c">mail</a></p>' +
      '<p><span data-spoiler>secret</span></p><pre>pre</pre><hr />' +
      '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>' +
      '<p><img src="/media/ab/cd.webp" alt="map" /></p>';
    expect(sanitizeHtmlSource(html)).toBe(html);
  });

  it('keeps the text of removed formatting', () => {
    expect(sanitizeHtmlSource('<div><font color="red">Gudrun</font></div>')).toBe('Gudrun');
  });
});

describe('sanitizeRichTextFields', () => {
  it('cleans HTML wherever the schema puts rich text, and only there', () => {
    const input = {
      name: rt.html('<b onclick="x()">Gudrun</b>'),
      summary: rt.md('<script>stays as written: Markdown is rendered without HTML</script>'),
      description: null,
      baseType: 'planet',
    };
    const clean = sanitizeRichTextFields(schemasFor('celestial_object').create, input);
    // <b> is allowed; its event handler isn't.
    expect(clean.name.source).toBe('<b>Gudrun</b>');
    expect(clean.summary.source).toBe(input.summary.source);
    expect(clean.description).toBeNull();
  });

  it('reaches rich text inside a union, such as a text fact', () => {
    const fact = {
      fieldDefinitionId: '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b',
      value: { type: 'text', text: rt.html('<img src=x onerror=alert(1)>5') },
    };
    expect(sanitizeRichTextFields(FactWrite, fact).value).toEqual({
      type: 'text',
      text: rt.html('5'),
    });
  });

  it('leaves look-alike objects outside rich-text positions alone', () => {
    const lookAlike = { format: 'html', source: '<script>x</script>', spoiler: false };
    const input = { name: rt.plain('x'), baseType: 'planet', appearance: lookAlike };
    expect(sanitizeRichTextFields(schemasFor('celestial_object').create, input).appearance).toEqual(
      lookAlike,
    );
  });
});
