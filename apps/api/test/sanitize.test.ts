import { FactWrite, rt, schemasFor } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { sanitizeHtmlSource, sanitizeRichTextFields } from '../src/services/sanitize.ts';

/**
 * The XSS corpus (M1-T5): each payload must come out harmless. "Harmless" is checked
 * structurally: no script, no event handler, no style, no dangerous URL, no SVG or MathML.
 */
const corpus: [string, string][] = [
  ['script tag', '<p>hi</p><script>alert(1)</script>'],
  ['script with odd case and spacing', '<ScRiPt >alert(1)</sCrIpT >'],
  ['img onerror', '<img src="/media/a.webp" onerror="alert(1)">'],
  ['img from elsewhere with onerror', '<img src=x onerror=alert(1)>'],
  ['onclick on an allowed tag', '<p onclick="alert(1)">click</p>'],
  ['onmouseover on a link', '<a href="https://example.com" onmouseover="alert(1)">x</a>'],
  ['javascript: link', '<a href="javascript:alert(1)">x</a>'],
  ['javascript: link with entities', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['javascript: link with a tab', '<a href="java\tscript:alert(1)">x</a>'],
  ['javascript: link, upper case', '<a href="JAVASCRIPT:alert(1)">x</a>'],
  ['data: link', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
  ['vbscript: link', '<a href="vbscript:msgbox(1)">x</a>'],
  ['protocol-relative link', '<a href="//evil.example">x</a>'],
  ['data: image', '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">'],
  ['svg onload', '<svg onload="alert(1)"><circle r="1"/></svg>'],
  ['svg with script', '<svg><script>alert(1)</script></svg>'],
  ['svg foreignObject', '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>'],
  ['math with a link', '<math><mtext><a href="javascript:alert(1)">x</a></mtext></math>'],
  ['style attribute', '<p style="background:url(javascript:alert(1))">x</p>'],
  ['style tag', '<style>body{background:url("javascript:alert(1)")}</style><p>x</p>'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['object and embed', '<object data="x.swf"></object><embed src="x.swf">'],
  [
    'form and input',
    '<form action="https://evil.example"><input name="x"><button>go</button></form>',
  ],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
  ['base tag', '<base href="https://evil.example/">'],
  ['nested-encoding tag', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['double-encoded javascript', '<a href="&amp;#106;avascript:alert(1)">x</a>'],
  ['unclosed tag tricks', '<p <script>alert(1)</script>>x</p>'],
  ['comment smuggling', '<!--<img src="--><img src=x onerror=alert(1)//">'],
  ['spoiler span with a handler', '<span data-spoiler onclick="alert(1)">secret</span>'],
  ['srcset on an image', '<img src="/media/a.webp" srcset="javascript:alert(1) 1x">'],
  ['link with target', '<a href="https://example.com" target="_self" rel="opener">x</a>'],
];

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
      '<h2>Title</h2><p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code></p>' +
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
    expect(clean.name.source).toBe('Gudrun');
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
