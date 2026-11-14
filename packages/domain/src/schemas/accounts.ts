import { z } from 'zod';
import { USERNAME_PATTERN } from '../patterns.ts';

/**
 * Accounts and signing in (M8-T1, D-34, data-model §3.8), as the API accepts and returns them.
 * Accounts exist only with `GE_AUTH_MODE=required`; on your own machine there's no login.
 */

const timestamp = z.iso.datetime({ offset: true });

/** An account's site role: admins also manage accounts (M8-T13). */
export const SITE_ROLES = ['admin', 'member'] as const;
export type SiteRole = (typeof SITE_ROLES)[number];
export const SiteRole = z.enum(SITE_ROLES);

/** What a single-use account link is for: making an account, or a new password and codes. */
export const ACCOUNT_LINK_PURPOSES = ['invite', 'reset'] as const;
export type AccountLinkPurpose = (typeof ACCOUNT_LINK_PURPOSES)[number];

/** How long an account link works, from when an admin makes it. */
export const ACCOUNT_LINK_TTL_MS: Record<AccountLinkPurpose, number> = {
  invite: 7 * 24 * 60 * 60 * 1000,
  reset: 24 * 60 * 60 * 1000,
};

export const PASSWORD_MIN_LENGTH = 12;
/** Long enough for any passphrase, short enough that hashing it can't be used to stall the API. */
export const PASSWORD_MAX_LENGTH = 256;

export const Username = z
  .string()
  .regex(
    new RegExp(USERNAME_PATTERN),
    'Use 3 to 32 lower-case letters, digits, hyphens or underscores, starting with a letter or digit.',
  );

export const Password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`);

/** A code from an authenticator app (TOTP, RFC 6238): six digits. */
export const TotpCode = z.string().regex(/^\d{6}$/, 'Type the 6-digit code from your app.');

/**
 * Signing in. The fields are checked only for size here: a malformed username or code fails
 * like a wrong one, with the same message, so the response says nothing about which was wrong.
 */
export const LoginRequest = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  totp: z.string().min(1).max(16),
});

/** The signed-in account (`GET /auth/me`). */
export const AccountRead = z.object({
  id: z.uuid(),
  username: Username,
  role: SiteRole,
  /** How much media the universes it owns may hold together, and how much they do (M8-T11). */
  mediaQuotaBytes: z.int().nonnegative(),
  mediaUsedBytes: z.int().nonnegative(),
  createdAt: timestamp,
});

/** One signed-in device (`GET /auth/sessions`). */
export const SessionRead = z.object({
  id: z.uuid(),
  /** The browser it was signed in from, as it named itself. */
  userAgent: z.string().nullable(),
  createdAt: timestamp,
  lastSeenAt: timestamp,
  expiresAt: timestamp,
  /** True for the session making this request. */
  current: z.boolean(),
});

/** What an account link is for, and whether it still works (`GET /auth/links/{token}`). */
export const AccountLinkRead = z.object({
  purpose: z.enum(ACCOUNT_LINK_PURPOSES),
  state: z.enum(['ready', 'used', 'expired']),
  /** A reset's account; null for an invite, whose username the person chooses. */
  username: Username.nullable(),
  expiresAt: timestamp,
});

/** The first step of an account link: the username (an invite only) and the password. */
export const AccountLinkStart = z.strictObject({
  username: Username.optional(),
  password: Password,
});

/**
 * The two-factor setup the first step returns. Nothing is saved yet: `setup` carries the chosen
 * username, the password's hash and the new secret, sealed by the API, and comes back with the
 * first code. `qrCode` is the otpauth URI as an SVG image (a data URL), for an authenticator
 * app to scan; `secret` is the same, to type in instead.
 */
export const AccountLinkSetup = z.object({
  setup: z.string(),
  secret: z.string(),
  otpauthUri: z.string(),
  qrCode: z.string(),
});

/** The second step: the sealed setup and one code from the app, proving it was set up. */
export const AccountLinkFinish = z.strictObject({
  setup: z.string().min(1).max(4096),
  totp: TotpCode,
});
