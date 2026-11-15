import { schema } from '@ge/db';
import type { TwoFactorDisable, TwoFactorEnable, TwoFactorSetup } from '@ge/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Requester } from '../services/access.ts';
import { recordAccessEvent } from '../services/access-events.ts';
import { RuleViolation } from '../services/errors.ts';
import { signedIn, type AuthContext, type SignedIn } from './context.ts';
import { Refused, TooManyAttempts } from './errors.ts';
import { checkPassword } from './passwords.ts';
import { checkConfirmation } from './sign-in.ts';
import { acceptedStep, newTotpSecret, otpauthUri, qrCodeDataUrl } from './totp.ts';

/**
 * Turning two-factor codes on and off from the account page (D-47). They're optional per
 * account: an invite can skip them, and these turn them on later, or off again.
 *
 * - **On** takes two steps, as an account link's codes do (auth/links.ts): `setup` makes a
 *   secret and returns it sealed, with its QR code, saving nothing; `enable` takes it back with
 *   one code from the app, and only then is it saved.
 * - **Off** needs the password and a current code, so a browser left signed in can't do it.
 *
 * Each change is recorded in `access_events`.
 */

const { users } = schema;

/** How long the step between setup and enable may take. */
const SETUP_TTL_MS = 30 * 60 * 1000;

/** The sealed setup. `purpose` keeps it apart from an account link's, sealed with the same key. */
const SetupPayload = z.object({
  purpose: z.literal('two-factor'),
  userId: z.uuid(),
  secret: z.string(),
  expiresAtMs: z.number(),
});

/** Step 1 of turning codes on: a new secret, sealed, with its QR code. Nothing is saved. */
export async function startTwoFactor(
  auth: AuthContext,
  account: SignedIn,
): Promise<z.infer<typeof TwoFactorSetup>> {
  if (account.twoFactor) throw new RuleViolation('Two-factor codes are already on.');
  const secret = newTotpSecret();
  const payload: z.infer<typeof SetupPayload> = {
    purpose: 'two-factor',
    userId: account.id,
    secret,
    expiresAtMs: Date.now() + SETUP_TTL_MS,
  };
  const uri = otpauthUri(secret, account.username, auth.publicUrl);
  return {
    setup: auth.setups.seal(Buffer.from(JSON.stringify(payload))).toString('base64url'),
    secret,
    otpauthUri: uri,
    qrCode: await qrCodeDataUrl(uri),
  };
}

/** The setup from step 1, if it's genuine, this account's, and not too old. */
function openSetup(auth: AuthContext, account: SignedIn, setup: string) {
  const opened = auth.setups.open(Buffer.from(setup, 'base64url'));
  let payload: z.infer<typeof SetupPayload> | undefined;
  try {
    payload = opened ? SetupPayload.parse(JSON.parse(opened.toString('utf8'))) : undefined;
  } catch {
    payload = undefined;
  }
  if (payload?.userId !== account.id || payload.expiresAtMs <= Date.now()) {
    throw new RuleViolation('This setup is out of date. Start again.', '/setup');
  }
  return payload;
}

/** Step 2: one code from the app proves it has the secret, which is then saved. */
export async function enableTwoFactor(
  auth: AuthContext,
  requester: Requester,
  account: SignedIn,
  input: z.infer<typeof TwoFactorEnable>,
): Promise<SignedIn> {
  const keys = [`two-factor:user:${account.id}`];
  const waitS = auth.limiter.retryAfterS(keys);
  if (waitS > 0) throw new TooManyAttempts(waitS);
  const { secret } = openSetup(auth, account, input.setup);
  const step = await acceptedStep(secret, input.totp, null);
  if (step === null) {
    auth.limiter.fail(keys);
    throw new RuleViolation(
      'That code didn’t work. Check that your device’s clock is right, then type the next code.',
      '/totp',
    );
  }
  return auth.db.transaction(async (tx) => {
    // Only while codes are off: two tabs finishing at once can't both save a secret.
    const [user] = await tx
      .update(users)
      .set({ totpSecretEnc: auth.totpSecrets.seal(Buffer.from(secret)), totpLastStep: step })
      .where(and(eq(users.id, account.id), isNull(users.totpSecretEnc)))
      .returning();
    if (!user) throw new RuleViolation('Two-factor codes are already on.');
    await recordAccessEvent(tx, requester, {
      action: 'user.two-factor.on',
      userId: user.id,
      detail: { username: user.username },
    });
    return signedIn(user);
  });
}

/** Turns codes off, given the password and a current code. */
export async function disableTwoFactor(
  auth: AuthContext,
  requester: Requester,
  account: SignedIn,
  input: z.infer<typeof TwoFactorDisable>,
): Promise<SignedIn> {
  const keys = [`password:user:${account.id}`];
  const waitS = auth.limiter.retryAfterS(keys);
  if (waitS > 0) throw new TooManyAttempts(waitS);
  const [current] = await auth.db.select().from(users).where(eq(users.id, account.id));
  if (!current || !(await checkPassword(current.passwordHash, input.currentPassword))) {
    auth.limiter.fail(keys);
    throw new Refused('That isn’t your current password.');
  }
  if (current.totpSecretEnc === null) throw new RuleViolation('Two-factor codes are already off.');
  await checkConfirmation(auth, account, { totp: input.totp });
  return auth.db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ totpSecretEnc: null, totpLastStep: null })
      .where(eq(users.id, account.id))
      .returning();
    if (!user) throw new Refused('This account no longer exists.');
    await recordAccessEvent(tx, requester, {
      action: 'user.two-factor.off',
      userId: user.id,
      detail: { username: user.username },
    });
    return signedIn(user);
  });
}
