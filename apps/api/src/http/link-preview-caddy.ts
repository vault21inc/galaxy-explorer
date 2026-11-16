import {
  LINK_PREVIEW_AGENT_PATTERN,
  LINK_PREVIEW_PATH_PATTERN,
  LINK_PREVIEW_ROUTE,
} from '@ge/domain/link-preview';

/** Where `pnpm headers:caddy` writes the snippet, from the repository root. */
export const LINK_PREVIEW_SNIPPET_PATH = 'ops/caddy/link-previews.caddy';

/** A Caddyfile token can't hold a space, quote or brace (a placeholder) unquoted. */
function bare(token: string): string {
  if (/[\s"'{}#]/.test(token)) throw new Error(`Can't write ${token} bare in a Caddyfile.`);
  return token;
}

/**
 * The Caddyfile snippet that sends link-preview fetchers to the API (M8-T9), from the lists
 * in packages/domain/src/link-preview.ts, which `vite preview` uses too. A request for a
 * universe's, map's or view's address from a chat app's or search engine's fetcher is
 * rewritten to the API's preview page, its path in the query; everyone else gets the app.
 *
 * The path is safe to put in a query as it is: the matcher lets through only slugs, ids and
 * slashes. The request's own query (`select=`) follows it, less a share link's key (`k=`):
 * a preview reads as a stranger and never uses it, and it would only end up in the API's log.
 */
export function linkPreviewSnippet(): string {
  const lines = [
    '# Link previews (M8-T9, @ge/domain/link-preview). Generated from',
    '# packages/domain/src/link-preview.ts by `pnpm headers:caddy`: edit that, not this.',
    '#',
    '# Import this file at the top of a Caddyfile, then `import link-previews` in the site.',
    '',
    '(link-previews) {',
    '\t# A chat app or search engine fetching an address that has a preview.',
    '\t@linkPreview {',
    `\t\tpath_regexp ${bare(LINK_PREVIEW_PATH_PATTERN)}`,
    `\t\theader_regexp User-Agent ${bare(`(?i)${LINK_PREVIEW_AGENT_PATTERN}`)}`,
    '\t}',
    '\t# Gets the API’s page of tags for it, not the app, which it couldn’t run.',
    '\thandle @linkPreview {',
    `\t\trewrite * ${LINK_PREVIEW_ROUTE}?path={path}&{query}`,
    '\t\t# A share link’s key: never used for a preview, and kept out of the logs.',
    '\t\turi query -k',
    '\t\treverse_proxy api:3000',
    '\t}',
    '}',
    '',
  ];
  return lines.join('\n');
}
