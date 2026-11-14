/**
 * The XSS corpus (M1-T5, extended in M8-T3): rich text written to break out of the page.
 * The API's sanitizer test checks that each HTML payload comes out of `RICH_TEXT_POLICY`
 * harmless, and the e2e test `xss.spec.ts` plants every payload through the API and checks
 * that nothing runs on the rendered pages, nor even tries to (the Content-Security-Policy would
 * report it). Each payload that could run calls `alert(1)`, which the e2e test watches for.
 *
 * Test data, not used by the app: imported as `@ge/domain/testing`.
 */

/** HTML, as an editor or an import might send it: [what it tries, the payload]. */
export const HTML_XSS_CORPUS: readonly (readonly [string, string])[] = [
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

/**
 * Markdown, which is stored as written and rendered without raw HTML (architecture.md §9):
 * its links and images are the way in.
 */
export const MARKDOWN_XSS_CORPUS: readonly (readonly [string, string])[] = [
  ['javascript: link', '[x](javascript:alert(1))'],
  ['javascript: link, mixed case', '[x](JaVaScRiPt:alert(1))'],
  ['javascript: link with an entity', '[x](&#106;avascript:alert(1))'],
  ['data: link', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
  ['reference link', '[x][evil]\n\n[evil]: javascript:alert(1)'],
  ['autolink', '<javascript:alert(1)>'],
  ['javascript: image', '![x](javascript:alert(1))'],
  ['image from elsewhere', '![x](https://evil.example/x.png)'],
  ['raw HTML', '<img src=x onerror=alert(1)> and <script>alert(1)</script>'],
  ['raw HTML in a spoiler', '||<img src=x onerror=alert(1)>||'],
  ['link title breakout', '[x](https://example.com "a\\" onmouseover=\\"alert(1)")'],
];

/** Plain text, which is only ever text. */
export const PLAIN_XSS_CORPUS: readonly (readonly [string, string])[] = [
  ['tag', '<img src=x onerror=alert(1)>'],
  ['script', '<script>alert(1)</script>'],
  ['URL', 'javascript:alert(1)'],
];
