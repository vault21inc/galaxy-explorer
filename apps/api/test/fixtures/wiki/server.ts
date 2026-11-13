import { readFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in MediaWiki API for tests (M7-T3), answering from the saved pages in this folder:
 * - `action=parse`: Gudrun and Hubris; "Gudrun (planet)" redirects to Gudrun; others are missing;
 * - `action=query&list=search`: the pages whose title contains the query;
 * - `action=query&meta=siteinfo`: the real wiki's address, article path and licence.
 * It records every request (its time, query and headers), so tests can check the client's
 * manners. The e2e run starts it on its own port (serve.ts).
 */

const PAGES: Readonly<Record<string, string>> = {
  Gudrun: readFileSync(new URL('gudrun.wikitext', import.meta.url), 'utf8'),
  Hubris: readFileSync(new URL('hubris.wikitext', import.meta.url), 'utf8'),
};
const REDIRECTS: Readonly<Record<string, string>> = { 'Gudrun (planet)': 'Gudrun' };

export interface FixtureRequest {
  at: number;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
}

export interface WikiFixtureServer {
  apiUrl: string;
  requests: FixtureRequest[];
  close: () => Promise<void>;
}

function answer(query: Record<string, string>): unknown {
  if (query.action === 'parse') {
    const asked = query.page ?? '';
    const title = query.redirects === '1' ? (REDIRECTS[asked] ?? asked) : asked;
    const wikitext = PAGES[title];
    if (wikitext === undefined) {
      return { error: { code: 'missingtitle', info: "The page you specified doesn't exist." } };
    }
    return {
      parse: {
        title,
        pageid: 1,
        wikitext,
        redirects: title === asked ? [] : [{ from: asked, to: title }],
      },
    };
  }
  if (query.action === 'query' && query.meta === 'siteinfo') {
    return {
      query: {
        general: {
          sitename: 'Warhammer 40k Wiki',
          server: 'https://warhammer40k.fandom.com',
          articlepath: '/wiki/$1',
        },
        rightsinfo: { url: 'https://www.fandom.com/licensing', text: 'CC-BY-SA' },
      },
    };
  }
  if (query.action === 'query' && query.list === 'search') {
    const needle = (query.srsearch ?? '').toLowerCase();
    return {
      query: {
        search: Object.keys(PAGES)
          .filter((title) => title.toLowerCase().includes(needle))
          .map((title) => ({
            title,
            snippet: `<span class="searchmatch">${title}</span> is a world`,
          })),
      },
    };
  }
  return { error: { code: 'badvalue', info: 'Unrecognized action.' } };
}

export async function startWikiFixtureServer(port = 0): Promise<WikiFixtureServer> {
  const requests: FixtureRequest[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture');
    const query = Object.fromEntries(url.searchParams.entries());
    requests.push({ at: Date.now(), query, headers: request.headers });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(answer(query)));
  });
  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', resolve);
  });
  const { port: bound } = server.address() as AddressInfo;
  return {
    apiUrl: `http://127.0.0.1:${bound.toString()}/api.php`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
