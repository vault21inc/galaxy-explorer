import { databaseErrorOf, schema, type Database } from '@ge/db';
import {
  ACCOUNT_LINK_TTL_MS,
  Username,
  type AccountLinkFinish,
  type AccountLinkRead,
  type AccountLinkSetup,
  type AccountLinkStart,
  type SiteRole,
} from '@ge/domain';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { RuleViolation } from '../services/errors.ts';
import { signedIn, type AuthContext, type SignedIn } from './context.ts';
import { hashToken, newToken } from './crypto.ts';
import { LinkGone, LinkNotFound, TooManyAttempts, UsernameTaken } from './errors.ts';
import { hashPassword } from './passwords.ts';
import { createSession, endSessionsOf } from './sessions.ts';
import { acceptedStep, newTotpSecret, otpauthUri, qrCodeDataUrl } from './totp.ts';

/**
 * Invite and reset links (M8-T1, ux.md §13). An admin makes one (the command line now, the admin
 * screens in M8-T13) and passes it on; the person opens `/link/{token}` and goes through two
 * steps:
 *
 * 1. **start:** choose a username (an invite) and a password. Nothing is saved: the API hashes
 *    the password, makes a two-factor secret, and returns both sealed as `setup`, with the
 *    secret as a QR code.
 * 2. **finish:** send `setup` back with one code from the authenticator app. Only now, once the
 *    app is known to work, is the account made (or its password and codes replaced) and the
 *    link used up, in one transaction.
 *
 * Keeping the setup in the client between the steps means half-finished links leave nothing in
 * the database, and starting again just makes a new secret.
 */

const { accountLinks, users } = schema;

/** How long the step between start and finish may take. */
const SETUP_TTL_MS = 30 * 60 * 1000;

const SetupPayload = z.object({
  linkId: z.uuid(),
  username: Username,
  passwordHash: z.string(),
  secret: z.string(),
  expiresAtMs: z.number(),
});

export type NewLink = { createdBy?: string | null } & (
  { purpose: 'invite'; role: SiteRole } | { purpose: 'reset'; userId: string }
);

/** Makes a link and returns its token, which is shown once and never stored. */
export async function createAccountLink(
  db: Database,
  link: NewLink,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + ACCOUNT_LINK_TTL_MS[link.purpose]);
  await db.insert(accountLinks).values({
    tokenHash: hashToken(token),
    purpose: link.purpose,
    role: link.purpose === 'invite' ? link.role : null,
    userId: link.purpose === 'reset' ? link.userId : null,
    createdBy: link.createdBy ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

/** The page a link opens (ux.md §13). */
export function linkUrl(publicUrl: string, token: string): string {
  return `${publicUrl}/link/${token}`;
}

type LinkRow = typeof accountLinks.$inferSelect;
type UserRow = typeof users.$inferSelect;
interface FoundLink {
  link: LinkRow;
  /** A reset's account. */
  user: UserRow | null;
  /** The rate limiter's keys for this request: the address and the link. */
  keys: string[];
}

/**
 * The link a token names, counting a miss against the address and the token. Tokens can't be
 * guessed, but the limit stops anyone from trying.
 */
async function findLink(auth: AuthContext, token: string, ip: string): Promise<FoundLink> {
  const tokenHash = hashToken(token);
  const keys = [`link:ip:${ip}`, `link:${tokenHash.toString('hex')}`];
  const waitS = auth.limiter.retryAfterS(keys);
  if (waitS > 0) throw new TooManyAttempts(waitS);
  const [row] = await auth.db
    .select({ link: accountLinks, user: users })
    .from(accountLinks)
    .leftJoin(users, eq(users.id, accountLinks.userId))
    .where(eq(accountLinks.tokenHash, tokenHash));
  if (!row) {
    auth.limiter.fail(keys);
    throw new LinkNotFound();
  }
  return { ...row, keys };
}

function stateOf({ link }: FoundLink): z.infer<typeof AccountLinkRead>['state'] {
  if (link.usedAt !== null) return 'used';
  return link.expiresAt.getTime() <= Date.now() ? 'expired' : 'ready';
}

/** Refuses a link that's used, expired, or for an account that was disabled since. */
function requireUsable(auth: AuthContext, found: FoundLink): void {
  const state = stateOf(found);
  const reason = state !== 'ready' ? state : found.user?.disabledAt ? 'disabled' : null;
  if (reason) {
    auth.limiter.fail(found.keys);
    throw new LinkGone(reason);
  }
}

/** `GET /auth/links/{token}`: what the link is for, and whether it still works. */
export async function describeLink(
  auth: AuthContext,
  token: string,
  ip: string,
): Promise<z.infer<typeof AccountLinkRead>> {
  const found = await findLink(auth, token, ip);
  return {
    purpose: found.link.purpose === 'reset' ? 'reset' : 'invite',
    state: stateOf(found),
    username: found.user?.username ?? null,
    expiresAt: found.link.expiresAt.toISOString(),
  };
}

/** Step 1: checks the username and password, and returns a new two-factor setup. */
export async function startLink(
  auth: AuthContext,
  token: string,
  input: z.infer<typeof AccountLinkStart>,
  ip: string,
): Promise<z.infer<typeof AccountLinkSetup>> {
  const found = await findLink(auth, token, ip);
  requireUsable(auth, found);
  let username: string;
  if (found.user) {
    username = found.user.username;
  } else {
    if (input.username === undefined) throw new RuleViolation('Choose a username.', '/username');
    username = input.username;
    const [taken] = await auth.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (taken) throw new UsernameTaken();
  }
  const secret = newTotpSecret();
  const payload: z.infer<typeof SetupPayload> = {
    linkId: found.link.id,
    username,
    passwordHash: await hashPassword(input.password),
    secret,
    expiresAtMs: Date.now() + SETUP_TTL_MS,
  };
  const uri = otpauthUri(secret, username, auth.publicUrl);
  return {
    setup: auth.setups.seal(Buffer.from(JSON.stringify(payload))).toString('base64url'),
    secret,
    otpauthUri: uri,
    qrCode: await qrCodeDataUrl(uri),
  };
}

/** The setup from step 1, if it's genuine, for this link, and not too old. */
function openSetup(auth: AuthContext, found: FoundLink, setup: string) {
  const opened = auth.setups.open(Buffer.from(setup, 'base64url'));
  let payload: z.infer<typeof SetupPayload> | undefined;
  try {
    payload = opened ? SetupPayload.parse(JSON.parse(opened.toString('utf8'))) : undefined;
  } catch {
    payload = undefined;
  }
  if (payload?.linkId !== found.link.id || payload.expiresAtMs <= Date.now()) {
    throw new RuleViolation('This setup is out of date. Start again.', '/setup');
  }
  return payload;
}

/**
 * Step 2: checks one code from the app, then makes the account (an invite) or replaces its
 * password and codes and signs out all its sessions (a reset), uses up the link, and signs the
 * person in, all in one transaction.
 */
export async function finishLink(
  auth: AuthContext,
  token: string,
  input: z.infer<typeof AccountLinkFinish>,
  client: { ip: string; userAgent: string | null },
): Promise<{ account: SignedIn; token: string; expiresAt: Date }> {
  const found = await findLink(auth, token, client.ip);
  requireUsable(auth, found);
  const setup = openSetup(auth, found, input.setup);
  const step = await acceptedStep(setup.secret, input.totp, null);
  if (step === null) {
    auth.limiter.fail(found.keys);
    throw new RuleViolation(
      'That code didn’t work. Check that your device’s clock is right, then type the next code.',
      '/totp',
    );
  }
  const totpSecretEnc = auth.totpSecrets.seal(Buffer.from(setup.secret));
  try {
    return await auth.db.transaction(async (tx) => {
      // Used up first, on the condition that nobody else did: a link works exactly once.
      const used = await tx
        .update(accountLinks)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(accountLinks.id, found.link.id),
            isNull(accountLinks.usedAt),
            gt(accountLinks.expiresAt, new Date()),
          ),
        )
        .returning({ id: accountLinks.id });
      if (used.length === 0) throw new LinkGone('used');
      const credentials = {
        passwordHash: setup.passwordHash,
        totpSecretEnc,
        totpLastStep: step,
        lastLoginAt: new Date(),
      };
      const [user] = found.user
        ? await tx.update(users).set(credentials).where(eq(users.id, found.user.id)).returning()
        : await tx
            .insert(users)
            .values({ username: setup.username, role: found.link.role ?? 'member', ...credentials })
            .returning();
      if (!user) throw new LinkGone('disabled');
      // A reset is for someone who lost their password or codes: whoever has them is signed out.
      if (found.user) await endSessionsOf(tx, user.id);
      const session = await createSession(tx, user.id, client.userAgent);
      return { account: signedIn(user), ...session };
    });
  } catch (error) {
    // The username was free at step 1 but someone took it since.
    if (databaseErrorOf(error)?.constraint === 'users_username_uq') throw new UsernameTaken();
    throw error;
  }
}
