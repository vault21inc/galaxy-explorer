/**
 * Writes the API's OpenAPI document to a file, for `pnpm api:generate` (M1-T10). It builds the
 * server in-process without listening: the database pool connects lazily, and nothing here
 * queries it, so no database or network is needed.
 *
 *   node src/openapi-cli.ts <output.json>
 */
import { writeFile } from 'node:fs/promises';
import { buildServer } from './server.ts';

const output = process.argv[2];
if (!output) {
  console.error('Usage: node src/openapi-cli.ts <output.json>');
  process.exit(1);
}

const app = await buildServer({
  databaseUrl: 'postgres://unused@127.0.0.1:1/unused',
  authMode: 'none',
  host: '127.0.0.1',
  mediaDir: '/nonexistent/ge-media',
  port: 0,
  logLevel: 'silent',
});
await app.ready();
await writeFile(output, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
console.log(`Wrote ${output}.`);
