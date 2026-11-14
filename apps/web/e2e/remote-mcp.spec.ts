import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  accountFromInvite,
  AUTH_URL,
  MCP_URL,
  nextCode,
  signInThrough,
  uniqueName,
} from './accounts.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * API tokens and remote MCP (M8-T2), the demo's step 7: an account makes a write token on its
 * account page, an agent uses it over remote MCP to create an object, the History panel shows
 * the change under the token's name, and revoking the token stops the agent at once.
 *
 * The agent here is plain JSON-RPC over HTTP, as any MCP client sends it, to the MCP server
 * that playwright.config.js runs in front of the API with accounts.
 */
test.use({ baseURL: AUTH_URL });

const plain = (text: string) => ({ format: 'plain', source: text });
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A universe with a map, made through the API as the signed-in account. */
async function ownUniverse(api: APIRequestContext) {
  const post = async (url: string, data: unknown) => {
    const response = await api.post(url, { headers: { origin: AUTH_URL }, data });
    if (!response.ok())
      throw new Error(`${url}: ${String(response.status())} ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const slug = uniqueName('agents');
  const universe = await post('/api/v1/universes', { slug, name: plain(`Agents ${slug}`) });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  return { slug, name: `Agents ${slug}`, mapId: map.id };
}

/** What the MCP server answers: a result, or an error (JSON-RPC 2.0). */
interface McpReply {
  result?: {
    serverInfo?: { name: string };
    isError?: boolean;
    content?: { type: 'text'; text: string }[];
  };
  error?: { message: string };
}

/** One MCP message, as a client sends it over Streamable HTTP. */
async function mcp(token: string, id: number, method: string, params: object) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const body = (await response.json()) as McpReply;
  return { status: response.status, body };
}

test('an agent with a write token creates an object over remote MCP, until the token is revoked', async ({
  page,
}) => {
  const account = await accountFromInvite();
  await signInThrough(page.context().request, account);
  const universe = await ownUniverse(page.context().request);

  // The account page: a write token for this one universe, shown once.
  await page.goto('/account');
  const tokens = page.getByRole('region', { name: 'API tokens' });
  const form = tokens.getByRole('form', { name: 'Make an API token' });
  await form.getByLabel('Name').fill('smoke-agent');
  await form.getByLabel(/^Write/).check();
  await form.getByLabel('Universe').selectOption({ label: `Only ${universe.name}` });
  await form.getByLabel('Code from your authenticator app').fill(await nextCode(account));
  await form.getByRole('button', { name: 'Make token' }).click();
  const shown = tokens.getByTestId('token-once');
  await expect(shown).toHaveText(/^ge_[A-Za-z0-9_-]{43}$/);
  const token = (await shown.textContent()) ?? '';
  expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
  await tokens.getByRole('button', { name: 'Done' }).click();
  await expect(tokens.getByText(`Write, only ${universe.name}`)).toBeVisible();

  // The agent: initialize, then a tool call that creates a system.
  const hello = await mcp(token, 1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e-agent', version: '1' },
  });
  expect(hello.status).toBe(200);
  expect(hello.body.result?.serverInfo?.name).toBe('galaxy-explorer');
  const created = await mcp(token, 2, 'tools/call', {
    name: 'objects_create',
    arguments: { mapId: universe.mapId, name: plain('Vigilus'), baseType: 'system' },
  });
  expect(created.status).toBe(200);
  const result = created.body.result;
  expect(result?.isError ?? false, result?.content?.[0]?.text).toBe(false);

  // The History panel says who made it: the token, for the account.
  await page.goto(`/u/${universe.slug}/main`);
  await waitForFirstFrame(page);
  await page.keyboard.press('e');
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: 'History' })
    .click();
  const history = page.getByRole('complementary', { name: 'History' });
  await expect(history.getByText(`token: smoke-agent, for ${account.username}`)).toBeVisible();
  await expect(history.getByText('MCP: objects_create — Vigilus')).toBeVisible();

  // Revoked on the account page: the agent is turned away at its next message.
  await page.goto('/account');
  await expect(tokens.getByText('last used', { exact: false })).toBeVisible();
  await tokens.getByRole('button', { name: 'Revoke smoke-agent' }).click();
  await expect(tokens.getByText('smoke-agent')).toHaveCount(0);
  const refused = await mcp(token, 3, 'tools/call', {
    name: 'objects_create',
    arguments: { mapId: universe.mapId, name: plain('Too late'), baseType: 'system' },
  });
  expect(refused.status).toBe(401);
});
