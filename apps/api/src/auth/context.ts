import { schema, type Database } from '@ge/db';
import type { AccountRead, SiteRole } from '@ge/domain';
import type { z } from 'zod';
import { AttemptLimiter } from './attempt-limiter.ts';
import { sealerFor, type Sealer } from './crypto.ts';
import { prepareDecoy } from './passwords.ts';

/**
 * What every account operation needs (M8-T1), made once when the API starts with
 * `GE_AUTH_MODE=required`. With `none` there are no accounts and no context.
 */
export interface AuthContext {
  db: Database;
  /** The site's origin, such as https://galaxy.example: writes must come from it. */
  publicUrl: string;
  /** Whether the session cookie is `Secure`: when the site is served over https. */
  secureCookies: boolean;
  /** Seals two-factor secrets at rest. */
  totpSecrets: Sealer;
  /** Seals the setup between an account link's two steps (auth/links.ts). */
  setups: Sealer;
  limiter: AttemptLimiter;
}

export function createAuthContext(
  db: Database,
  options: { sessionSecret: string; publicUrl: string; limiter?: AttemptLimiter },
): AuthContext {
  void prepareDecoy();
  return {
    db,
    publicUrl: options.publicUrl,
    secureCookies: new URL(options.publicUrl).protocol === 'https:',
    totpSecrets: sealerFor(options.sessionSecret, 'totp-secret'),
    setups: sealerFor(options.sessionSecret, 'link-setup'),
    limiter: options.limiter ?? new AttemptLimiter(),
  };
}

/** A signed-in account, as the request carries it. */
export interface SignedIn {
  id: string;
  username: string;
  role: SiteRole;
  mediaQuotaBytes: number;
  createdAt: Date;
}

type UserRow = typeof schema.users.$inferSelect;

export function signedIn(user: UserRow): SignedIn {
  return {
    id: user.id,
    username: user.username,
    // The database's check constraint allows only the site roles.
    role: user.role as SiteRole,
    mediaQuotaBytes: user.mediaQuotaBytes,
    createdAt: user.createdAt,
  };
}

/** The account as `GET /auth/me` returns it, with the media its universes hold. */
export function accountRead(
  account: SignedIn,
  mediaUsedBytes: number,
): z.infer<typeof AccountRead> {
  return { ...account, mediaUsedBytes, createdAt: account.createdAt.toISOString() };
}

/** The account's two-factor secret, opened. */
export function totpSecretOf(auth: AuthContext, user: UserRow): string {
  const secret = auth.totpSecrets.open(user.totpSecretEnc);
  // Only a changed GE_SESSION_SECRET does this, and every account is affected: say so loudly.
  if (!secret) {
    throw new Error(
      `The two-factor secret of ${user.username} can't be opened. Was GE_SESSION_SECRET changed?`,
    );
  }
  return secret.toString('utf8');
}
