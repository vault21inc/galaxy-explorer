import { SITE_NAME } from '@ge/domain';
import type { LinkPreview } from '../services/link-preview-service.ts';

/**
 * The page a link-preview fetcher gets (M8-T9): Open Graph tags (Facebook's, which most chat
 * apps read), Twitter's card tags, a description and the canonical address. Search engines
 * read the same page (D-62), so its body has the whole text, a breadcrumb, links to the pages
 * below and the page described as schema.org data (JSON-LD), which Google shows as the
 * breadcrumb in its results. No scripts that run and no styles: it's only read by programs,
 * under the API's own `default-src 'none'` policy, which a JSON-LD block, being data, obeys.
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
    `<script type="application/ld+json">${jsonLd(preview)}</script>`,
  ];
  const link = (url: string, text: string) =>
    `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
  const crumbs =
    preview.crumbs.length > 0
      ? [`  <nav>${preview.crumbs.map((crumb) => link(crumb.url, crumb.name)).join(' › ')}</nav>`]
      : [];
  const links = preview.links
    ? [
        `  <h2>${escapeHtml(preview.links.heading)}</h2>`,
        '  <ul>',
        ...preview.links.items.map(
          (item) =>
            `    <li>${link(item.url, item.name)}${item.text ? ` — ${escapeHtml(item.text)}` : ''}</li>`,
        ),
        '  </ul>',
      ]
    : [];
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    ...tags.filter((tag): tag is string => tag !== null).map((tag) => `  ${tag}`),
    '</head>',
    '<body>',
    ...crumbs,
    `  <h1>${escapeHtml(preview.heading)}</h1>`,
    ...preview.body.map((paragraph) => `  <p>${escapeHtml(paragraph)}</p>`),
    ...links,
    `  <p>${link(preview.url, `Explore it in ${SITE_NAME}`)}</p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * The page as schema.org data: a web page on the site, with its breadcrumb (from the site down
 * to the page itself) and its picture. `<` is written as `<`, which JSON reads the same,
 * so no text in it can close the script element.
 */
function jsonLd(preview: LinkPreview): string {
  const site = preview.crumbs[0]?.url ?? preview.url;
  const trail = [...preview.crumbs, { name: preview.heading, url: preview.url }];
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: preview.heading,
    description: preview.description,
    url: preview.url,
    ...(preview.image ? { image: preview.image.url } : {}),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: site },
    ...(preview.crumbs.length > 0
      ? {
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: trail.map((crumb, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: crumb.name,
              item: crumb.url,
            })),
          },
        }
      : {}),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
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
