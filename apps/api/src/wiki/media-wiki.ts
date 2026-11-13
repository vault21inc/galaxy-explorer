import type { WikiSearchHit } from '@ge/domain';
import { NotFound, UpstreamError } from '../services/errors.ts';

/**
 * A wiki "Fill from wiki" reads (M7-T3), through the MediaWiki API (`api.php`), which Fandom
 * wikis and Wikipedia both serve:
 * - `search(q)`: `action=query&list=search`, and whether `q` is itself a page's title;
 * - `page(title)`: `action=parse&prop=wikitext`, following redirects;
 * - `site()`: the wiki's address for page links and its text licence (`meta=siteinfo`).
 *
 * Polite by construction: every request names the client (`userAgent`), requests to one host
 * are spaced at least `minIntervalMs` apart (one a second), and answers are kept for
 * `cacheMs` (a day), so the same page asked for twice costs one request.
 */

export interface WikiPage {
  title: string;
  /** The title asked for, when the wiki redirected it to `title`. */
  redirectedFrom: string | null;
  wikitext: string;
}

export interface WikiSite {
  /** The address of a page, from the wiki's own article path. */
  pageUrl: (title: string) => string;
  license: string | null;
  licenseUrl: string | null;
}

export interface MediaWikiOptions {
  userAgent: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  cacheMs?: number;
  timeoutMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 10;

/** When each host may next be asked, shared by every source on it. */
const nextRequestAt = new Map<string, number>();

/** A wiki leaves a setting empty rather than out: both mean it has none. */
const nonEmpty = (value: string | undefined) =>
  value === undefined || value === '' ? null : value;

const sleepFor = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export class MediaWikiSource {
  readonly #apiUrl: URL;
  readonly #options: Required<MediaWikiOptions>;
  readonly #cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(apiUrl: string, options: MediaWikiOptions) {
    this.#apiUrl = new URL(apiUrl);
    this.#options = {
      fetch: globalThis.fetch.bind(globalThis),
      now: Date.now,
      sleep: sleepFor,
      minIntervalMs: 1_000,
      cacheMs: DAY_MS,
      timeoutMs: 15_000,
      ...options,
    };
  }

  /** The wiki's home, such as https://warhammer40k.fandom.com. */
  get siteUrl(): string {
    return this.#apiUrl.origin;
  }

  async search(query: string): Promise<WikiSearchHit[]> {
    const asked = query.trim();
    const search = {
      action: 'query',
      list: 'search',
      srsearch: asked,
      srlimit: String(SEARCH_LIMIT),
      srprop: 'snippet',
    };
    // Some wikis' search, Fandom's among them, leaves out the page titled exactly as the query
    // (their search box would jump straight to it), so "Cadia" lists Cadian Sector but not
    // Cadia. The same request therefore also asks whether the query is a page's title,
    // following redirects, and that page leads the list. A `|` separates titles, so a query
    // with one looks none up.
    const body = (await this.#get(
      asked.includes('|') ? search : { ...search, titles: asked, redirects: '1' },
    )) as {
      query?: {
        search?: { title: string; snippet?: string }[];
        pages?: { pageid?: number; ns?: number; title: string }[];
      };
    };
    // A missing, invalid or special title comes back without a page id; only articles count.
    const exact = (body.query?.pages ?? [])
      .filter((page) => page.pageid !== undefined && page.ns === 0)
      .map((page) => ({ title: page.title, snippet: '' }));
    const found = (body.query?.search ?? [])
      .filter((hit) => !exact.some((page) => page.title === hit.title))
      .map((hit) => ({
        title: hit.title,
        // Search snippets mark the match with <span class="searchmatch">; plain text here.
        snippet: (hit.snippet ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"'),
      }));
    return [...exact, ...found].slice(0, SEARCH_LIMIT);
  }

  async page(title: string): Promise<WikiPage> {
    const body = (await this.#get({
      action: 'parse',
      page: title,
      prop: 'wikitext',
      redirects: '1',
    })) as {
      parse?: { title: string; wikitext: string; redirects?: { from: string; to: string }[] };
      error?: { code: string; info?: string };
    };
    if (body.error?.code === 'missingtitle') throw new NotFound('wiki page', title);
    if (!body.parse) throw new UpstreamError(`The wiki couldn't read “${title}”.`);
    const redirect = body.parse.redirects?.[0];
    return {
      title: body.parse.title,
      redirectedFrom: redirect ? redirect.from : null,
      wikitext: body.parse.wikitext,
    };
  }

  async site(): Promise<WikiSite> {
    const body = (await this.#get({
      action: 'query',
      meta: 'siteinfo',
      siprop: 'general|rightsinfo',
    })) as {
      query?: {
        general?: { server?: string; articlepath?: string };
        rightsinfo?: { url?: string; text?: string };
      };
    };
    const general = body.query?.general;
    // The server may be protocol-relative ("//warhammer40k.fandom.com").
    const server = general?.server?.startsWith('//')
      ? `${this.#apiUrl.protocol}${general.server}`
      : (general?.server ?? this.#apiUrl.origin);
    const articlePath = general?.articlepath ?? '/wiki/$1';
    return {
      pageUrl: (title) =>
        `${server}${articlePath.replace('$1', encodeURIComponent(title.replace(/ /g, '_')))}`,
      license: nonEmpty(body.query?.rightsinfo?.text),
      licenseUrl: nonEmpty(body.query?.rightsinfo?.url),
    };
  }

  /** One API request: from the cache, or after waiting for this host's turn. */
  async #get(params: Record<string, string>): Promise<unknown> {
    const url = new URL(this.#apiUrl);
    for (const [name, value] of Object.entries({ ...params, format: 'json', formatversion: '2' })) {
      url.searchParams.set(name, value);
    }
    const key = url.toString();
    const { now, sleep, minIntervalMs, cacheMs, timeoutMs, userAgent } = this.#options;
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;

    // Take this host's next free slot, then wait for it: requests queue one a second.
    const host = url.host;
    const at = Math.max(now(), nextRequestAt.get(host) ?? 0);
    nextRequestAt.set(host, at + minIntervalMs);
    const wait = at - now();
    if (wait > 0) await sleep(wait);

    let response: Response;
    try {
      response = await this.#options.fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new UpstreamError(`The wiki didn't answer (${String(error)}).`);
    }
    if (!response.ok) throw new UpstreamError(`The wiki answered ${response.status.toString()}.`);
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new UpstreamError('The wiki sent something that isn’t JSON.');
    }
    this.#cache.set(key, { expiresAt: now() + cacheMs, value });
    return value;
  }
}

/** Forgets every host's queue: for tests that run several clients one after another. */
export function resetWikiQueues(): void {
  nextRequestAt.clear();
}
