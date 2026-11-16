import { SITE_NAME } from '@ge/domain';
import type { LinkPreview } from '../services/link-preview-service.ts';

/**
 * The page a link-preview fetcher gets (M8-T9): Open Graph tags (Facebook's, which most chat
 * apps read), Twitter's card tags, a description and the canonical address, and a heading and
 * a line of text for anything that reads the body instead. No scripts, no styles: it's only
 * read by programs, under the API's own `default-src 'none'` policy.
 */
export function linkPreviewPage(preview: LinkPreview): string {
  const meta = (attribute: 'name' | 'property', key: string, value: string) =>
    `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`;
  const tags = [
    '<meta charset="utf-8">',
    `<title>${escapeHtml(preview.title)}</title>`,
    meta('name', 'description', preview.description),
    `<link rel="canonical" href="${escapeHtml(preview.url)}">`,
    preview.noIndex ? meta('name', 'robots', 'noindex') : null,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:title', preview.heading),
    meta('property', 'og:description', preview.description),
    meta('property', 'og:url', preview.url),
    ...(preview.image
      ? [
          meta('property', 'og:image', preview.image.url),
          meta('property', 'og:image:width', String(preview.image.width)),
          meta('property', 'og:image:height', String(preview.image.height)),
          preview.image.alt ? meta('property', 'og:image:alt', preview.image.alt) : null,
        ]
      : []),
    // A large picture when there is one, as chat apps show for a planet; otherwise a line.
    meta('name', 'twitter:card', preview.image ? 'summary_large_image' : 'summary'),
  ];
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    ...tags.filter((tag): tag is string => tag !== null).map((tag) => `  ${tag}`),
    '</head>',
    '<body>',
    `  <h1>${escapeHtml(preview.heading)}</h1>`,
    `  <p>${escapeHtml(preview.description)}</p>`,
    `  <p><a href="${escapeHtml(preview.url)}">${escapeHtml(preview.url)}</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Text in an HTML attribute or element: the five characters that could end either. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
