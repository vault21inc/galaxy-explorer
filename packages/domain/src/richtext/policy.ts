/**
 * What rich text may contain (ux.md §8). The server's sanitize-html (M1-T5) and the browser's
 * DOMPurify (M3) both read this one policy, so they can't drift apart.
 */
export const RICH_TEXT_POLICY = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    // HTML pasted from wikis often uses <b> and <i> for bold and italic; they carry no more
    // risk than <strong> and <em>.
    'b',
    'i',
    'u',
    's',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'a',
    'code',
    'pre',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
    'span',
    'img',
  ],
  allowedAttributes: {
    a: ['href'],
    span: ['data-spoiler'],
    img: ['src', 'alt'],
  },
  /** URL schemes allowed in links. Site-relative links (`/u/…`, `#…`) are allowed too. */
  allowedLinkSchemes: ['http', 'https', 'mailto'],
  /** Images inside rich text must be this site's uploads. */
  imageSourcePrefix: '/media/',
  /** Added to every link when rendering (architecture.md §9). */
  linkTarget: '_blank',
  linkRel: 'noopener noreferrer nofollow ugc',
} as const satisfies {
  allowedTags: readonly string[];
  allowedAttributes: Readonly<Record<string, readonly string[]>>;
  allowedLinkSchemes: readonly string[];
  imageSourcePrefix: string;
  linkTarget: string;
  linkRel: string;
};

/** Control characters and whitespace, which browsers strip or ignore inside URLs. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const URL_NOISE = /[\u0000- \u007f-\u009f]/g;

/** True for a link target the policy allows: http(s), mailto, or a link within this site. */
export function isAllowedLinkUrl(url: string): boolean {
  const cleaned = url.replace(URL_NOISE, '');
  if (cleaned.startsWith('#')) return true;
  // `//host` and `/\host` are links to another site, not paths on this one.
  if (cleaned.startsWith('/')) return !/^\/[/\\]/.test(cleaned);
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
  return (
    scheme !== undefined &&
    (RICH_TEXT_POLICY.allowedLinkSchemes as readonly string[]).includes(scheme)
  );
}

/** True for an image source the policy allows: a file under this site's `/media/`. */
export function isAllowedImageSource(src: string): boolean {
  const cleaned = src.replace(URL_NOISE, '');
  return (
    cleaned.startsWith(RICH_TEXT_POLICY.imageSourcePrefix) &&
    !cleaned.includes('\\') &&
    !cleaned.split(/[/?#]/).includes('..')
  );
}
