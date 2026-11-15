import { createHash } from 'node:crypto';
import { schema } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createAuthContext } from '../../src/auth/context.ts';
import { Refused } from '../../src/auth/errors.ts';
import { createSession } from '../../src/auth/sessions.ts';
import { checkConfirmation } from '../../src/auth/sign-in.ts';
import { buildServer } from '../../src/server.ts';
import { testConfig } from '../helpers.ts';
import {
  authServer,
  codeFor,
  makeAccount,
  ORIGIN,
  PUBLIC_URL,
  SESSION_SECRET,
  sessionOf,
  signIn,
  whoAmI,
} from './auth-world.ts';

/** Signing in, sessions and who may write (M8-T1), with GE_AUTH_MODE=required. */

const FAILED = 'That didn’t work. Check your username, password and code, and try again.';

describe('signing in', () => {
  it('refuses a wrong password, a wrong or old code, and an unknown name, all alike', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const attempts = [
          signIn(
            app,
            { ...aemos, password: 'not the password at all' },
            await codeFor(aemos.secret),
          ),
          signIn(app, aemos, '000000'),
          // Three steps (90 s) ago: outside the one-step window either way.
          signIn(app, aemos, await codeFor(aemos.secret, -90)),
          signIn(app, { ...aemos, username: 'nobody' }, await codeFor(aemos.secret)),
          signIn(app, aemos, 'not a code'),
        ];
        for (const response of await Promise.all(attempts)) {
          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({ detail: FAILED });
          expect(response.cookies).toEqual([]);
        }
      } finally {
        await app.close();
      }
    }));

  it('signs in with a session cookie that only its hash is stored for', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos', { role: 'admin' });
        // The username is matched as lower-case.
        const response = await signIn(
          app,
          { ...aemos, username: ' Aemos ' },
          await codeFor(aemos.secret),
        );
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          data: { username: 'aemos', role: 'admin', mediaQuotaBytes: 2 * 1024 ** 3 },
        });
        const [cookie] = response.cookies;
        expect(cookie).toMatchObject({
          name: 'ge_session',
          httpOnly: true,
          sameSite: 'Lax',
          path: '/',
        });
        // http here; https sites get `Secure` (the next test).
        expect(cookie?.secure).toBeUndefined();
        const days = ((cookie?.expires?.getTime() ?? 0) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThanOrEqual(30);

        const stored = await db.select().from(schema.sessions);
        expect(stored).toHaveLength(1);
        expect(stored[0]?.tokenHash).toEqual(
          createHash('sha256')
            .update(cookie?.value ?? '')
            .digest(),
        );

        const session = sessionOf(response);
        expect(await whoAmI(app, session)).toBe('aemos');
        const health = await app.inject({ method: 'GET', url: '/api/health', headers: session });
        expect(health.json()).toMatchObject({ data: { authMode: 'required', canEdit: true } });
        const anonymous = await app.inject({ method: 'GET', url: '/api/health' });
        expect(anonymous.json()).toMatchObject({ data: { canEdit: false } });
        expect(await whoAmI(app, {})).toBeNull();
      } finally {
        await app.close();
      }
    }));

  it('marks the cookie Secure on an https site', () =>
    withTestDb(async (db, url) => {
      const app = await buildServer(
        testConfig({
          databaseUrl: url,
          authMode: 'required',
          sessionSecret: SESSION_SECRET,
          publicUrl: 'https://galaxy.test',
        }),
      );
      try {
        const aemos = await makeAccount(db, 'aemos');
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin: 'https://galaxy.test' },
          payload: {
            username: 'aemos',
            password: aemos.password,
            totp: await codeFor(aemos.secret),
          },
        });
        expect(response.cookies[0]).toMatchObject({ name: 'ge_session', secure: true });
      } finally {
        await app.close();
      }
    }));

  it('accepts each code once', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const code = await codeFor(aemos.secret);
        expect((await signIn(app, aemos, code)).statusCode).toBe(200);
        expect((await signIn(app, aemos, code)).statusCode).toBe(401);
        // The next step's code is within the window, and newer.
        expect((await signIn(app, aemos, await codeFor(aemos.secret, 30))).statusCode).toBe(200);
      } finally {
        await app.close();
      }
    }));

  it('ends an expired session, and signs out', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const first = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret)));
        const second = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret, 30)));

        await db.execute(sql`update sessions set expires_at = now() - interval '1 second'
          where token_hash = sha256(convert_to(${first.cookie.slice('ge_session='.length)}, 'UTF8'))`);
        const expired = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: first });
        expect(expired.json()).toEqual({ data: null });
        // The browser is told to forget it, and the row is gone.
        expect(expired.cookies[0]).toMatchObject({ name: 'ge_session', value: '' });
        expect(await db.select().from(schema.sessions)).toHaveLength(1);

        const out = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: { ...second, ...ORIGIN },
        });
        expect(out.statusCode).toBe(204);
        expect(out.cookies[0]).toMatchObject({ name: 'ge_session', value: '' });
        expect(await whoAmI(app, second)).toBeNull();
        expect(await db.select().from(schema.sessions)).toHaveLength(0);
      } finally {
        await app.close();
      }
    }));

  it('lists the account’s devices and signs them out', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const laptop = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret)));
        const phone = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret, 30)));
        const listed = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/sessions',
          headers: laptop,
        });
        const devices = listed.json<{ data: { id: string; current: boolean }[] }>().data;
        expect(devices).toHaveLength(2);
        const other = devices.find((device) => !device.current);
        expect(devices.filter((device) => device.current)).toHaveLength(1);

        const ended = await app.inject({
          method: 'DELETE',
          url: `/api/v1/auth/sessions/${other?.id ?? ''}`,
          headers: { ...laptop, ...ORIGIN },
        });
        expect(ended.statusCode).toBe(204);
        expect(await whoAmI(app, phone)).toBeNull();
        expect(await whoAmI(app, laptop)).toBe('aemos');

        // A third device, signed in straight in the database (a third code would be two steps
        // ahead, outside the window), then "Sign out every other device".
        const tablet = {
          cookie: `ge_session=${(await createSession(db, aemos.id, 'Tablet')).token}`,
        };
        expect(await whoAmI(app, tablet)).toBe('aemos');
        const others = await app.inject({
          method: 'DELETE',
          url: '/api/v1/auth/sessions',
          headers: { ...laptop, ...ORIGIN },
        });
        expect(others.statusCode).toBe(204);
        expect(await whoAmI(app, tablet)).toBeNull();
        expect(await whoAmI(app, laptop)).toBe('aemos');
      } finally {
        await app.close();
      }
    }));
});

describe('writes', () => {
  it('refuse anonymous visitors, and writes from other sites', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const session = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret)));
        const create = (headers: Record<string, string>, slug: string) =>
          app.inject({
            method: 'POST',
            url: '/api/v1/universes',
            headers,
            payload: { slug, name: rt.plain(slug) },
          });

        const anonymous = await create(ORIGIN, 'anonymous');
        expect(anonymous.statusCode).toBe(401);
        expect(anonymous.json()).toMatchObject({ detail: 'Sign in to make changes.' });
        const drafts = await app.inject({
          method: 'GET',
          url: '/api/v1/universes?includeDrafts=true',
        });
        expect(drafts.statusCode).toBe(401);
        expect((await app.inject({ method: 'GET', url: '/api/v1/universes' })).statusCode).toBe(
          200,
        );

        // Signed in, but sent from another site, or with no Origin at all: refused.
        expect((await create({ ...session, origin: 'http://evil.test' }, 'evil')).statusCode).toBe(
          403,
        );
        expect((await create(session, 'no-origin')).statusCode).toBe(403);

        const created = await create({ ...session, ...ORIGIN }, 'mine');
        expect(created.statusCode).toBe(201);
        // History records the account.
        const [batch] = await db
          .select()
          .from(schema.changeBatches)
          .where(eq(schema.changeBatches.id, created.headers['x-ge-batch-id'] as string));
        expect(batch).toMatchObject({ actorType: 'user', actorId: aemos.id, actorLabel: 'aemos' });
      } finally {
        await app.close();
      }
    }));
});

describe('a disabled account', () => {
  it('loses its session at the next request and can’t sign in', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const session = sessionOf(await signIn(app, aemos, await codeFor(aemos.secret)));
        expect(await whoAmI(app, session)).toBe('aemos');
        await db
          .update(schema.users)
          .set({ disabledAt: new Date() })
          .where(eq(schema.users.id, aemos.id));
        expect(await whoAmI(app, session)).toBeNull();
        const again = await signIn(app, aemos, await codeFor(aemos.secret, 30));
        expect(again.statusCode).toBe(401);
        expect(again.json()).toMatchObject({ detail: FAILED });
      } finally {
        await app.close();
      }
    }));
});

describe('the rate limit', () => {
  it('stops a username after 5 failures from anywhere, and an address after 5 for anyone', () =>
    withTestDb(async (db, url) => {
      const app = await authServer(url);
      try {
        const aemos = await makeAccount(db, 'aemos');
        const wrong = { ...aemos, password: 'wrong password, long enough' };
        for (let i = 0; i < 5; i += 1) {
          expect((await signIn(app, wrong, '000000', `10.0.0.${String(i)}`)).statusCode).toBe(401);
        }
        // The right details, from a fresh address: the username waits.
        const blocked = await signIn(app, aemos, await codeFor(aemos.secret), '10.0.1.1');
        expect(blocked.statusCode).toBe(429);
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(800);
        expect(blocked.json<{ detail: string }>().detail).toMatch(
          /^Too many tries\. Wait 1[45] minutes/,
        );

        const ravenor = await makeAccount(db, 'ravenor');
        for (let i = 0; i < 5; i += 1) {
          const name = { username: `stranger-${String(i)}`, password: 'any password at all' };
          expect((await signIn(app, name, '000000', '10.0.2.2')).statusCode).toBe(401);
        }
        // Another account, from the address that failed: the address waits.
        expect(
          (await signIn(app, ravenor, await codeFor(ravenor.secret), '10.0.2.2')).statusCode,
        ).toBe(429);
        expect(
          (await signIn(app, ravenor, await codeFor(ravenor.secret), '10.0.2.3')).statusCode,
        ).toBe(200);
      } finally {
        await app.close();
      }
    }));
});

describe('a confirmation (requireConfirmation)', () => {
  it('takes a code, checked like a sign-in’s, once per code', () =>
    withTestDb(async (db) => {
      const auth = createAuthContext(db, { sessionSecret: SESSION_SECRET, publicUrl: PUBLIC_URL });
      const aemos = await makeAccount(db, 'aemos');
      const account = {
        id: aemos.id,
        username: 'aemos',
        role: 'member' as const,
        mediaQuotaBytes: 0,
        twoFactor: true,
        createdAt: new Date(),
      };
      await expect(checkConfirmation(auth, account, {})).rejects.toThrow(Refused);
      await expect(checkConfirmation(auth, account, { totp: '000000' })).rejects.toThrow(Refused);
      // With codes on, the password isn't enough.
      await expect(checkConfirmation(auth, account, { password: aemos.password })).rejects.toThrow(
        'This needs a current code',
      );
      const code = await codeFor(aemos.secret);
      await expect(checkConfirmation(auth, account, { totp: code })).resolves.toBeUndefined();
      await expect(checkConfirmation(auth, account, { totp: code })).rejects.toThrow(
        'That code didn’t work',
      );
    }));
});

describe('with GE_AUTH_MODE=none', () => {
  it('has no account routes', async () => {
    const app = await buildServer(testConfig());
    try {
      const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(me.statusCode).toBe(404);
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
      expect(login.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
