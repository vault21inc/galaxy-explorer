import { readFile } from 'node:fs/promises';
import { BASE_TYPES, objectTypes } from '@ge/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.ts';
import { testConfig } from './helpers.ts';

/** The guide for LLM agents (M7-T8): served, linked, and in step with the registries. */

const guide = await readFile(new URL('../../../docs/api/llm-guide.md', import.meta.url), 'utf8');
const app = await buildServer(testConfig());
afterAll(() => app.close());

describe('the LLM guide', () => {
  it('is served as Markdown, and the API docs point to it', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/llm-guide.md' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/markdown/);
    expect(response.body).toBe(guide);
    const openapi = (await app.inject({ method: 'GET', url: '/api/openapi.json' })).json<{
      info: { description: string };
    }>();
    expect(openapi.info.description).toContain('/api/llm-guide.md');
  });

  it('says which parents each base type allows, and which open a view, as the registry does', () => {
    // The table's rows: | `planet` | system, map | orbit |
    const rows = new Map(
      [...guide.matchAll(/^\| `([a-z_]+)` \| ([a-z, ]+) \| ([a-z—]+) \|$/gm)].map((match) => [
        match[1] ?? '',
        { parents: (match[2] ?? '').split(', '), view: match[3] === '—' ? null : match[3] },
      ]),
    );
    expect([...rows.keys()].sort()).toEqual([...BASE_TYPES].sort());
    for (const type of BASE_TYPES) {
      expect(rows.get(type), type).toEqual({
        parents: [...objectTypes[type].parents],
        view: objectTypes[type].explorableAs,
      });
    }
  });
});
