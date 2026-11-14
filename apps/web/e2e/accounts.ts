import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';

/**
 * Helpers for the account tests (M8-T1). They run against the second API, the one with
 * GE_AUTH_MODE=required, behind its own preview server (playwright.config.js).
 */

function fromEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run these tests through playwright.config.js.`);
  return value;
}

/** The site with accounts, such as http://localhost:4174. */
export const AUTH_URL = fromEnv('GE_E2E_AUTH_URL');

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

/**
 * A 6-digit code from an authenticator app for `secret`, `offsetS` seconds from now: RFC 6238
 * written out here (HMAC-SHA1 over the 30-second step, then "dynamic truncation"), so the tests
 * also check that the API's codes are the standard ones authenticator apps make.
 */
export function totp(secret: string, offsetS = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const step = Math.floor((Date.now() / 1000 + offsetS) / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = (mac.at(-1) ?? 0) & 0xf;
  const value = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

/** Runs `pnpm admin:invite`, as an admin on the server would, and returns the link's path. */
export function inviteLink(options: { admin?: boolean } = {}): string {
  const output = execFileSync('pnpm', ['admin:invite', ...(options.admin ? ['--admin'] : [])], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: fromEnv('GE_E2E_AUTH_DATABASE_URL'),
      GE_PUBLIC_URL: AUTH_URL,
    },
    encoding: 'utf8',
  });
  const path = /https?:\/\/[^/\s]+(\/link\/[A-Za-z0-9_-]+)/.exec(output)?.[1];
  if (!path) throw new Error(`No link in pnpm admin:invite's output:\n${output}`);
  return path;
}

/** A username no other test (or browser) uses. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export interface Account {
  username: string;
  password: string;
  secret: string;
}

/** An API client for the site with accounts, sending writes from its own origin. */
export function siteApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: AUTH_URL, extraHTTPHeaders: { origin: AUTH_URL } });
}

/**
 * An account made through an invite link's two steps, over the API. Its first code is used up
 * here, so the next sign-in must use the next step's code (`totp(secret, 30)`).
 */
export async function accountFromInvite(options: { admin?: boolean } = {}): Promise<Account> {
  const token = inviteLink(options).slice('/link/'.length);
  const api = await siteApi();
  try {
    const account = { username: uniqueName('e2e'), password: 'a long e2e test password' };
    const started = await api.post(`/api/v1/auth/links/${token}/start`, { data: account });
    if (!started.ok())
      throw new Error(`start: ${String(started.status())} ${await started.text()}`);
    const { secret, setup } = (
      (await started.json()) as { data: { secret: string; setup: string } }
    ).data;
    const finished = await api.post(`/api/v1/auth/links/${token}/finish`, {
      data: { setup, totp: totp(secret) },
    });
    if (!finished.ok())
      throw new Error(`finish: ${String(finished.status())} ${await finished.text()}`);
    return { ...account, secret };
  } finally {
    await api.dispose();
  }
}

/** Signs a browser context in through the API, with the account's next code. */
export async function signInThrough(api: APIRequestContext, account: Account): Promise<void> {
  const response = await api.post('/api/v1/auth/login', {
    headers: { origin: AUTH_URL },
    data: {
      username: account.username,
      password: account.password,
      totp: totp(account.secret, 30),
    },
  });
  if (!response.ok())
    throw new Error(`sign-in: ${String(response.status())} ${await response.text()}`);
}
