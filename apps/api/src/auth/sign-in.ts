import { schema, type Database, type Transaction } from '@ge/db';
import type { LoginRequest } from '@ge/domain';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { z } from 'zod';
import { signedIn, totpSecretOf, type AuthContext, type SignedIn } from './context.ts';
import { CodeNeeded, Refused, SignInFailed, TooManyAttempts } from './errors.ts';
import { checkPassword } from './passwords.ts';
import { createSession } from './sessions.ts';
import { acceptedStep } from './totp.ts';

const { users } = schema;

/** Usernames are lower-case; what someone types is matched as lower-case too. */
export function normalUsername(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Records that the account used the code of `step`, if no code of that step or a later one was
 * used before. The condition is in the update itself, so two requests racing with the same code
 * can't both win.
 */
export async function claimStep(
  db: Database | Transaction,
  userId: string,
  step: number,
  options: { signingIn?: boolean } = {},
): Promise<boolean> {
  const claimed = await db
    .update(users)
    .set({ totpLastStep: step, ...(options.signingIn ? { lastLoginAt: new Date() } : {}) })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return claimed.length > 0;
}

/**
 * Signs in with a username, a password and, for an account with two-factor codes on, a code
 * (M8-T1, D-47). Every failure looks the same to the client; each one counts against the address
 * and the username (auth/attempt-limiter.ts). The right password without a needed code isn't a
 * failure: it's answered with `CodeNeeded`, so the page can ask for the code.
 */
export async function signIn(
  auth: AuthContext,
  input: z.infer<typeof LoginRequest>,
  client: { ip: string; userAgent: string | null },
): Promise<{ account: SignedIn; token: string; expiresAt: Date }> {
  const username = normalUsername(input.username);
  const byUser = `sign-in:user:${username}`;
  const keys = [`sign-in:ip:${client.ip}`, byUser];
  const waitS = auth.limiter.retryAfterS(keys);
  if (waitS > 0) throw new TooManyAttempts(waitS);

  const [user] = await auth.db.select().from(users).where(eq(users.username, username));
  // The password is checked even for a missing or disabled account, so the time it takes
  // doesn't tell an attacker which usernames exist.
  const passwordOk = await checkPassword(user?.passwordHash, input.password);
  if (!user || !passwordOk || user.disabledAt !== null) {
    auth.limiter.fail(keys);
    throw new SignInFailed();
  }
  const secret = totpSecretOf(auth, user);
  if (secret === null) {
    await auth.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  } else {
    if (input.totp === undefined) throw new CodeNeeded();
    const step = await acceptedStep(secret, input.totp, user.totpLastStep);
    if (step === null || !(await claimStep(auth.db, user.id, step, { signingIn: true }))) {
      auth.limiter.fail(keys);
      throw new SignInFailed();
    }
  }
  auth.limiter.clear(byUser);
  const session = await createSession(auth.db, user.id, client.userAgent);
  return { account: signedIn(user), ...session };
}

/** What a request offers to confirm a destructive action: a current code, or the password. */
export interface Confirmation {
  totp?: string | undefined;
  password?: string | undefined;
}

/**
 * The guard behind `requireConfirmation` (M8-T1, D-47): a destructive action (M8-T12, T13) asks
 * the signed-in account to prove someone is at the screen, so a browser left signed in isn't
 * enough to delete a universe or disable an account. An account with two-factor codes on gives a
 * current code, checked like a sign-in's; one with them off gives its password. Failures count
 * against the account, as a sign-in's do.
 */
export async function checkConfirmation(
  auth: AuthContext,
  account: SignedIn,
  given: Confirmation,
): Promise<void> {
  const keys = [`confirm:user:${account.id}`];
  const waitS = auth.limiter.retryAfterS(keys);
  if (waitS > 0) throw new TooManyAttempts(waitS);
  const [user] = await auth.db.select().from(users).where(eq(users.id, account.id));
  if (!user) throw new Refused('This account no longer exists.');
  const secret = totpSecretOf(auth, user);
  if (secret === null) {
    if (!given.password) throw new Refused('This needs your password.');
    if (!(await checkPassword(user.passwordHash, given.password))) {
      auth.limiter.fail(keys);
      throw new Refused('That isn’t your password.');
    }
    return;
  }
  if (!given.totp) throw new Refused('This needs a current code from your authenticator app.');
  const step = await acceptedStep(secret, given.totp, user.totpLastStep);
  if (step === null || !(await claimStep(auth.db, user.id, step))) {
    auth.limiter.fail(keys);
    throw new Refused('That code didn’t work. Wait for the next one and try again.');
  }
}
