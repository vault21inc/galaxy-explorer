import { schema, type Database } from '@ge/db';
import { generate } from 'otplib';
import { sealerFor } from '../../src/auth/crypto.ts';
import { hashPassword } from '../../src/auth/passwords.ts';
import { newTotpSecret } from '../../src/auth/totp.ts';
import type { Config } from '../../src/config.ts';
import { buildServer, type ApiServer } from '../../src/server.ts';
import { testConfig } from '../helpers.ts';

/** Shared set-up for the account tests (M8-T1): a server with accounts, and accounts in it. */

export const PUBLIC_URL = 'http://galaxy.test';
export const SESSION_SECRET = 'test-only session secret, at least 32 characters long';
/** Writes from the site's own pages carry this; anything else is refused. */
export const ORIGIN = { origin: PUBLIC_URL };

export function authConfig(databaseUrl: string, overrides: Partial<Config> = {}): Config {
  return testConfig({
    databaseUrl,
    authMode: 'required',
    sessionSecret: SESSION_SECRET,
    publicUrl: PUBLIC_URL,
    ...overrides,
  });
}

export function authServer(databaseUrl: string): Promise<ApiServer> {
  return buildServer(authConfig(databaseUrl));
}

/** A code from `secret`'s authenticator app, `offsetS` seconds from now. */
export function codeFor(secret: string, offsetS = 0): Promise<string> {
  return generate({ secret, epoch: Math.floor(Date.now() / 1000) + offsetS });
}

export interface TestAccount {
  id: string;
  username: string;
  password: string;
  secret: string;
}

/** An account made straight in the database, as `pnpm admin:create-user` makes one. */
export async function makeAccount(
  db: Database,
  username: string,
  options: { role?: 'admin' | 'member'; password?: string } = {},
): Promise<TestAccount> {
  const password = options.password ?? `${username} has a long password`;
  const secret = newTotpSecret();
  const [user] = await db
    .insert(schema.users)
    .values({
      username,
      role: options.role ?? 'member',
      passwordHash: await hashPassword(password),
      totpSecretEnc: sealerFor(SESSION_SECRET, 'totp-secret').seal(Buffer.from(secret)),
    })
    .returning({ id: schema.users.id });
  if (!user) throw new Error('No user was made.');
  return { id: user.id, username, password, secret };
}

/** The session cookie a response set, as a `cookie` header for the next request. */
export function sessionOf(response: { cookies: { name: string; value: string }[] }): {
  cookie: string;
} {
  const cookie = response.cookies.find((item) => item.name === 'ge_session');
  if (!cookie?.value) throw new Error('The response set no session cookie.');
  return { cookie: `ge_session=${cookie.value}` };
}

/** Signs in through the API, and returns the response. */
export function signIn(
  app: ApiServer,
  account: Pick<TestAccount, 'username' | 'password'>,
  totp: string,
  remoteAddress = '127.0.0.1',
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: ORIGIN,
    remoteAddress,
    payload: { username: account.username, password: account.password, totp },
  });
}

/** Who `GET /auth/me` says the request is: the username, or null. */
export async function whoAmI(app: ApiServer, headers: Record<string, string>) {
  const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers });
  return response.json<{ data: { username: string } | null }>().data?.username ?? null;
}
