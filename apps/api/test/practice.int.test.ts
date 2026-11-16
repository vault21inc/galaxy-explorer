import { schema, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.ts';
import {
  authConfig,
  codeFor,
  makeAccount,
  ORIGIN,
  sessionOf,
  signIn,
  type TestAccount,
} from './auth/auth-world.ts';
import { apiOn } from './contract/harness.ts';

/**
 * The editor tour's practice universe (M8-T10): the demo, in a new universe of the account's,
 * private, made as one change, which nobody else sees and its owner deletes as any universe.
 */

type Json = Record<string, any>;

async function accountsServer(db: Database, url: string) {
  const app = await buildServer(authConfig(url));
  const learner = await makeAccount(db, 'learner');
  const other = await makeAccount(db, 'other');
  const sessions = new Map<TestAccount, Record<string, string>>();
  for (const account of [learner, other]) {
    sessions.set(account, sessionOf(await signIn(app, account, await codeFor(account.secret))));
  }
  const call = async (
    who: TestAccount | null,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload?: object,
    extra: Record<string, string> = {},
  ) => {
    const response = await app.inject({
      method,
      url: `/api/v1${path}`,
      headers: { ...(who ? sessions.get(who) : {}), ...ORIGIN, ...extra },
      ...(payload ? { payload } : {}),
    });
    return { status: response.statusCode, body: response.body ? response.json<Json>() : {} };
  };
  return { app, learner, other, call };
}

describe('the practice universe (M8-T10)', () => {
  it('is the demo in a new private universe of the account’s, as one change', () =>
    withTestDb(async (db, url) => {
      const { app, learner, other, call } = await accountsServer(db, url);
      try {
        const made = await call(learner, 'POST', '/practice-universe');
        expect(made.status, JSON.stringify(made.body)).toBe(201);
        const { universe, mapSlug } = made.body.data as { universe: Json; mapSlug: string };
        expect(universe).toMatchObject({
          namePlain: 'Practice',
          visibility: 'private',
          owner: 'learner',
          access: 'own',
        });
        expect(universe.slug).toMatch(/^practice-[0-9a-f]{8}$/);
        expect(mapSlug).toBe('main');

        // The demo's content, in one change in its History, by the account.
        const maps = await call(learner, 'GET', `/universes/${String(universe.id)}/maps`);
        expect((maps.body.data as Json[]).map((map) => map.slug).sort()).toEqual([
          'after-the-fall',
          'main',
        ]);
        const batches = await db
          .select()
          .from(schema.changeBatches)
          .where(eq(schema.changeBatches.universeId, String(universe.id)));
        expect(batches).toHaveLength(1);
        expect(batches[0]).toMatchObject({
          actorLabel: 'learner',
          description: 'Practice universe for the editor tour',
        });

        // Another one gets an address of its own.
        const again = await call(learner, 'POST', '/practice-universe');
        expect(again.body.data.universe.slug).not.toBe(universe.slug);

        // Nobody else sees it: a stranger and another account get "not found".
        for (const who of [null, other]) {
          expect(
            (await call(who, 'GET', `/universes/by-slug/${String(universe.slug)}`)).status,
          ).toBe(404);
          const listed = await call(who, 'GET', '/universes');
          expect((listed.body.data as Json[]).map((item) => item.namePlain)).not.toContain(
            'Practice',
          );
        }
        // Signed out, it can't be made.
        expect((await call(null, 'POST', '/practice-universe')).status).toBe(401);

        // Its owner deletes it as any universe, with a fresh code.
        const deleted = await call(
          learner,
          'DELETE',
          `/universes/${String(universe.id)}`,
          { version: universe.version },
          { 'x-ge-totp': await codeFor(learner.secret, 30) },
        );
        expect(deleted.status).toBe(204);
        expect((await call(learner, 'GET', `/universes/${String(universe.id)}`)).status).toBe(404);
      } finally {
        await app.close();
      }
    }));

  it('is the installation’s locally, where there are no accounts', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const made = await api.expect(201, 'POST', '/practice-universe');
        expect(made.body.data.universe).toMatchObject({ namePlain: 'Practice', owner: null });
      } finally {
        await api.app.close();
      }
    }));
});
