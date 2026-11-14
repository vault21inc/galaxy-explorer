import { schema, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { generate } from 'otplib';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createAccountLink, type NewLink } from '../../src/auth/links.ts';
import type { ApiServer } from '../../src/server.ts';
import {
  authServer,
  codeFor,
  makeAccount,
  ORIGIN,
  sessionOf,
  signIn,
  whoAmI,
} from './auth-world.ts';

/** Invite and reset links (M8-T1): single use, two steps, and only then an account. */

async function link(db: Database, what: NewLink): Promise<string> {
  return (await createAccountLink(db, what)).token;
}

function describeLink(app: ApiServer, token: string) {
  return app.inject({ method: 'GET', url: `/api/v1/auth/links/${token}` });
}

function start(app: ApiServer, token: string, body: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/auth/links/${token}/start`,
    headers: ORIGIN,
    payload: body,
  });
}

function finish(app: ApiServer, token: string, setup: string, totp: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/auth/links/${token}/finish`,
    headers: ORIGIN,
    payload: { setup, totp },
  });
}

interface Setup {
  setup: string;
  secret: string;
  otpauthUri: string;
  qrCode: string;
}

const PASSWORD = 'a brand new long password';

describe('an invite', () => {
  it('makes an account once, and is refused the second time', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const token = await link(db, { purpose: 'invite', role: 'admin' });
        expect((await describeLink(app, token)).json()).toMatchObject({
          data: { purpose: 'invite', state: 'ready', username: null },
        });

        const started = await start(app, token, { username: 'gideon', password: PASSWORD });
        expect(started.statusCode).toBe(200);
        const setup = started.json<{ data: Setup }>().data;
        expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/.*gideon\?.*secret=/);
        expect(setup.otpauthUri).toContain('galaxy.test');
        expect(setup.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
        // Nothing is saved before the first code.
        expect(await db.select().from(schema.users)).toEqual([]);

        // A wrong code leaves the link as it was.
        const wrong = await finish(app, token, setup.setup, '000000');
        expect(wrong.statusCode).toBe(422);
        expect(await db.select().from(schema.users)).toEqual([]);

        const done = await finish(app, token, setup.setup, await codeFor(setup.secret));
        expect(done.statusCode).toBe(200);
        expect(done.json()).toMatchObject({ data: { username: 'gideon', role: 'admin' } });
        expect(await whoAmI(app, sessionOf(done))).toBe('gideon');
        // The new account signs in with what it chose (a newer code: each is used once).
        const again = await signIn(
          app,
          { username: 'gideon', password: PASSWORD },
          await codeFor(setup.secret, 30),
        );
        expect(again.statusCode).toBe(200);

        expect((await describeLink(app, token)).json()).toMatchObject({ data: { state: 'used' } });
        const reused = await start(app, token, { username: 'other', password: PASSWORD });
        expect(reused.statusCode).toBe(410);
        // Even the setup from before can't be finished again.
        const refinished = await finish(app, token, setup.setup, await codeFor(setup.secret));
        expect(refinished.statusCode).toBe(410);
        expect(await db.select().from(schema.users)).toHaveLength(1);
      } finally {
        await app.close();
      }
    }));

  it('refuses a taken username, a short password, and a setup from another link', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        await makeAccount(db, 'gideon');
        const token = await link(db, { purpose: 'invite', role: 'member' });
        const taken = await start(app, token, { username: 'gideon', password: PASSWORD });
        expect(taken.statusCode).toBe(409);
        expect(taken.json()).toMatchObject({ detail: 'That username is taken. Choose another.' });
        expect(
          (await start(app, token, { username: 'eisenhorn', password: 'short' })).statusCode,
        ).toBe(400);
        expect((await start(app, token, { password: PASSWORD })).statusCode).toBe(422);

        const other = await link(db, { purpose: 'invite', role: 'member' });
        const setup = (
          await start(app, other, { username: 'eisenhorn', password: PASSWORD })
        ).json<{
          data: Setup;
        }>().data;
        const crossed = await finish(app, token, setup.setup, await codeFor(setup.secret));
        expect(crossed.statusCode).toBe(422);
        expect(crossed.json()).toMatchObject({ detail: 'This setup is out of date. Start again.' });
        const forged = await finish(
          app,
          other,
          `${setup.setup.slice(0, -4)}AAAA`,
          await codeFor(setup.secret),
        );
        expect(forged.statusCode).toBe(422);
      } finally {
        await app.close();
      }
    }));

  it('stops working when it expires', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const token = await link(db, { purpose: 'invite', role: 'member' });
        const setup = (await start(app, token, { username: 'gideon', password: PASSWORD })).json<{
          data: Setup;
        }>().data;
        await db.execute(sql`update account_links set expires_at = now() - interval '1 second'`);
        expect((await describeLink(app, token)).json()).toMatchObject({
          data: { state: 'expired' },
        });
        const late = await finish(app, token, setup.setup, await codeFor(setup.secret));
        expect(late.statusCode).toBe(410);
        expect(late.json()).toMatchObject({
          detail: 'This link has expired. Ask an admin for a new one.',
        });
        expect(await db.select().from(schema.users)).toEqual([]);
      } finally {
        await app.close();
      }
    }));
});

describe('a reset', () => {
  it('replaces the password and codes, and signs out every session', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const before = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret)));
        const token = await link(db, { purpose: 'reset', userId: aemos.id });
        expect((await describeLink(app, token)).json()).toMatchObject({
          data: { purpose: 'reset', state: 'ready', username: 'aemos' },
        });
        // The username is the account's; one sent along is ignored.
        const started = await start(app, token, { password: PASSWORD });
        const setup = started.json<{ data: Setup }>().data;
        expect(setup.otpauthUri).toContain('aemos');
        const done = await finish(app, token, setup.setup, await codeFor(setup.secret));
        expect(done.statusCode).toBe(200);

        expect(await whoAmI(app, before)).toBeNull();
        expect(await whoAmI(app, sessionOf(done))).toBe('aemos');
        // The old password and the old app both stop working; the new ones work.
        const oldPassword = await signIn(
          app,
          aemos,
          await generate({ secret: setup.secret, epoch: Math.floor(Date.now() / 1000) + 30 }),
        );
        expect(oldPassword.statusCode).toBe(401);
        const oldApp = await signIn(
          app,
          { username: 'aemos', password: PASSWORD },
          await codeFor(aemos.secret, 30),
        );
        expect(oldApp.statusCode).toBe(401);
        const fresh = await signIn(
          app,
          { username: 'aemos', password: PASSWORD },
          await codeFor(setup.secret, 30),
        );
        expect(fresh.statusCode).toBe(200);
      } finally {
        await app.close();
      }
    }));
});

describe('the links’ rate limit', () => {
  it('stops an address that keeps trying links that don’t work', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const token = await link(db, { purpose: 'invite', role: 'member' });
        for (let i = 0; i < 5; i += 1) {
          const miss = await describeLink(app, `no-such-link-${String(i)}`);
          expect(miss.statusCode).toBe(404);
          expect(miss.json()).toMatchObject({
            detail: 'This link doesn’t work. Ask an admin for a new one.',
          });
        }
        // Even a real link waits now, from that address.
        expect((await describeLink(app, token)).statusCode).toBe(429);
      } finally {
        await app.close();
      }
    }));
});
