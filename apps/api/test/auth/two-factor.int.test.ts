import { schema, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createAccountLink } from '../../src/auth/links.ts';
import type { ApiServer } from '../../src/server.ts';
import {
  authServer,
  codeFor,
  makeAccount,
  makeAccountWithoutCodes,
  ORIGIN,
  sessionOf,
  signIn,
} from './auth-world.ts';

/**
 * Two-factor codes, optional per account (D-47): an invite or a reset can skip them, the account
 * page turns them on and off, an account without them signs in with its password and confirms
 * destructive actions with it.
 */

type Json = Record<string, any>;

async function post(app: ApiServer, url: string, payload: unknown, headers = {}) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { ...ORIGIN, ...headers },
    payload: payload as Json,
  });
  const body = response.body === '' ? {} : response.json<Json>();
  return { status: response.statusCode, body, response };
}

function signInWithoutCode(app: ApiServer, account: { username: string; password: string }) {
  return post(app, '/auth/login', { username: account.username, password: account.password });
}

const secretOf = async (db: Database, userId: string) =>
  (await db.select().from(schema.users).where(eq(schema.users.id, userId)))[0]?.totpSecretEnc;

/** Each code works once; these tests are about the routes, so they forget the last one used. */
const forgetLastCode = (db: Database, userId: string) =>
  db.update(schema.users).set({ totpLastStep: null }).where(eq(schema.users.id, userId));

function withApp(fn: (app: ApiServer, db: Database) => Promise<void>) {
  return withTestDb(async (db, url) => {
    const app = await authServer(url);
    try {
      await fn(app, db);
    } finally {
      await app.close();
    }
  });
}

describe('optional two-factor codes (D-47)', () => {
  it('an invite can skip them, and the account signs in with its password alone', () =>
    withApp(async (app, db) => {
      const { token } = await createAccountLink(db, { purpose: 'invite', role: 'member' });
      const password = 'gideon ravenor has a long password';
      const started = await post(app, `/auth/links/${token}/start`, {
        username: 'ravenor',
        password,
        twoFactor: false,
      });
      expect(started.status, JSON.stringify(started.body)).toBe(200);
      expect(started.body.data).toMatchObject({ secret: null, qrCode: null, otpauthUri: null });
      const finished = await post(app, `/auth/links/${token}/finish`, {
        setup: started.body.data.setup,
      });
      expect(finished.status, JSON.stringify(finished.body)).toBe(200);
      expect(finished.body.data).toMatchObject({ username: 'ravenor', twoFactor: false });
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'ravenor'));
      expect(user?.totpSecretEnc).toBeNull();

      const signedIn = await signInWithoutCode(app, { username: 'ravenor', password });
      expect(signedIn.status, JSON.stringify(signedIn.body)).toBe(200);
      expect(signedIn.body.data.twoFactor).toBe(false);
      const wrong = await signInWithoutCode(app, {
        username: 'ravenor',
        password: 'not it at all',
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body.errors).toBeUndefined();
    }));

  it('with codes on, the right password alone asks for the code, and a wrong one doesn’t say so', () =>
    withApp(async (app, db) => {
      const aemos = await makeAccount(db, 'aemos');
      const right = await signInWithoutCode(app, aemos);
      expect(right.status).toBe(401);
      expect(right.body.errors).toEqual([{ path: '/totp', message: expect.any(String) }]);
      const wrong = await signInWithoutCode(app, { ...aemos, password: 'not the password' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.errors).toBeUndefined();
      const withCode = await signIn(app, aemos, await codeFor(aemos.secret));
      expect(withCode.statusCode).toBe(200);
    }));

  it('a link that set up codes needs a code to finish', () =>
    withApp(async (app, db) => {
      const { token } = await createAccountLink(db, { purpose: 'invite', role: 'member' });
      // A client that doesn't say gets codes, as before they were optional.
      const started = await post(app, `/auth/links/${token}/start`, {
        username: 'medea',
        password: 'medea betancore has a long password',
      });
      expect(started.body.data.secret).toEqual(expect.any(String));
      const finished = await post(app, `/auth/links/${token}/finish`, {
        setup: started.body.data.setup,
      });
      expect(finished.status).toBe(422);
      expect(finished.body.errors).toEqual([{ path: '/totp', message: expect.any(String) }]);
    }));

  it('a reset without codes turns them off', () =>
    withApp(async (app, db) => {
      const aemos = await makeAccount(db, 'aemos');
      const { token } = await createAccountLink(db, { purpose: 'reset', userId: aemos.id });
      const password = 'a brand new long password';
      const started = await post(app, `/auth/links/${token}/start`, { password, twoFactor: false });
      const finished = await post(app, `/auth/links/${token}/finish`, {
        setup: started.body.data.setup,
      });
      expect(finished.status, JSON.stringify(finished.body)).toBe(200);
      expect(finished.body.data.twoFactor).toBe(false);
      expect(await secretOf(db, aemos.id)).toBeNull();
      expect((await signInWithoutCode(app, { username: 'aemos', password })).status).toBe(200);
    }));

  it('the account page turns them on with one code, and off with the password and a code', () =>
    withApp(async (app, db) => {
      const ravenor = await makeAccountWithoutCodes(db, 'ravenor');
      const session = sessionOf((await signInWithoutCode(app, ravenor)).response);

      const setup = await post(app, '/auth/two-factor/setup', undefined, session);
      expect(setup.status, JSON.stringify(setup.body)).toBe(200);
      const { secret } = setup.body.data as { secret: string };
      const badCode = await post(
        app,
        '/auth/two-factor/enable',
        { setup: setup.body.data.setup, totp: '000000' },
        session,
      );
      expect(badCode.status).toBe(422);
      const enabled = await post(
        app,
        '/auth/two-factor/enable',
        { setup: setup.body.data.setup, totp: await codeFor(secret) },
        session,
      );
      expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
      expect(enabled.body.data.twoFactor).toBe(true);
      expect((await post(app, '/auth/two-factor/setup', undefined, session)).status).toBe(422);

      // Signing in now asks for a code.
      expect((await signInWithoutCode(app, ravenor)).body.errors).toEqual([
        { path: '/totp', message: expect.any(String) },
      ]);
      await forgetLastCode(db, ravenor.id);
      expect((await signIn(app, ravenor, await codeFor(secret))).statusCode).toBe(200);

      await forgetLastCode(db, ravenor.id);
      const wrongPassword = await post(
        app,
        '/auth/two-factor/disable',
        { currentPassword: 'not it at all', totp: await codeFor(secret) },
        session,
      );
      expect(wrongPassword.status).toBe(403);
      const disabled = await post(
        app,
        '/auth/two-factor/disable',
        { currentPassword: ravenor.password, totp: await codeFor(secret) },
        session,
      );
      expect(disabled.status, JSON.stringify(disabled.body)).toBe(200);
      expect(disabled.body.data.twoFactor).toBe(false);
      expect(await secretOf(db, ravenor.id)).toBeNull();
      expect((await signInWithoutCode(app, ravenor)).status).toBe(200);

      const events = await db
        .select({ action: schema.accessEvents.action })
        .from(schema.accessEvents)
        .where(eq(schema.accessEvents.userId, ravenor.id))
        .orderBy(schema.accessEvents.id);
      expect(events.map((event) => event.action)).toEqual([
        'user.two-factor.on',
        'user.two-factor.off',
      ]);
    }));

  it('without codes, a destructive action is confirmed with the password', () =>
    withApp(async (app, db) => {
      const ravenor = await makeAccountWithoutCodes(db, 'ravenor');
      const session = sessionOf((await signInWithoutCode(app, ravenor)).response);
      const token = { name: 'an agent', scope: 'read' };
      const noConfirmation = await post(app, '/auth/tokens', token, session);
      expect(noConfirmation.status).toBe(403);
      expect(noConfirmation.body.detail).toMatch(/needs your password/);
      const code = await post(app, '/auth/tokens', token, { ...session, 'x-ge-totp': '123456' });
      expect(code.status).toBe(403);
      const wrong = await post(app, '/auth/tokens', token, {
        ...session,
        'x-ge-password': encodeURIComponent('not it at all'),
      });
      expect(wrong.status).toBe(403);
      // Percent-encoded, as the web app sends it: the password has spaces.
      const made = await post(app, '/auth/tokens', token, {
        ...session,
        'x-ge-password': encodeURIComponent(ravenor.password),
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
    }));

  it('without codes, a password change needs only the current password', () =>
    withApp(async (app, db) => {
      const ravenor = await makeAccountWithoutCodes(db, 'ravenor');
      const session = sessionOf((await signInWithoutCode(app, ravenor)).response);
      const changed = await post(
        app,
        '/auth/password',
        { currentPassword: ravenor.password, newPassword: 'another long password' },
        session,
      );
      expect(changed.status, JSON.stringify(changed.body)).toBe(204);
    }));
});
