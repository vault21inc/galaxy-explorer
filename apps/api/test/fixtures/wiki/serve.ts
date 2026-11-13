import { startWikiFixtureServer } from './server.ts';

/** `node serve.ts <port>`: the fixture wiki for the e2e run (apps/web/playwright.config.js). */
const port = Number(process.argv[2] ?? '3102');
const server = await startWikiFixtureServer(port);
console.log(`Fixture wiki at ${server.apiUrl}`);
