import { z } from 'zod';
import { USERNAME_PATTERN } from '../patterns.ts';
import { MemberRole } from './containers.ts';

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

// ---- sharing a universe (M8-T12, ux.md §13) -------------------------------------------------

/** An account a universe is shared with (`GET /universes/{universeId}/members`). */
export const UniverseMemberRead = z.object({
  username: Username,
  role: MemberRole,
  /** Who shared it with them, if that account still exists. */
  addedBy: Username.nullable(),
  createdAt: timestamp,
});

/** Sharing a universe with an account, or changing its role (`PUT …/members/{username}`). */
export const UniverseMemberWrite = z.strictObject({ role: MemberRole });

/**
 * Opening a share link (`POST /universes/unlock`): the universe's address and the link's key,
 * which a visitor holding only the link has, rather than the universe's id.
 */
export const UniverseUnlock = z.strictObject({
  slug: z.string().min(1).max(100),
  key: z.string().min(1).max(100),
});

/** Handing a universe to another account (`POST /universes/{universeId}/transfer`). */
export const UniverseTransfer = z.strictObject({ username: Username });

/**
 * What `access_events` records (M8-T12, T13, data-model §3.8): account and access changes, the
 * admin screens' log. Sharing's come from universes' owners, the rest from admins (or `cli`,
 * the server's command line), and `user.password` from the account itself.
 */
export const ACCESS_EVENT_ACTIONS = [
  'member.add',
  'member.role',
  'member.remove',
  'member.leave',
  'universe.visibility',
  'universe.link',
  'universe.transfer',
  'universe.delete',
  'universe.takedown',
  'invite.create',
  'user.reset',
  'user.disable',
  'user.enable',
  'user.role',
  'user.quota',
  'user.delete',
  'user.password',
] as const;
export type AccessEventAction = (typeof ACCESS_EVENT_ACTIONS)[number];

// ---- the account page (M8-T13, ux.md §13) --------------------------------------------------

/** Changing one's password: the current one, the new one, and a current code. */
export const PasswordChange = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: Password,
  totp: TotpCode,
});

/** How much of the media quota the account's universes use, universe by universe. */
export const StorageRead = z.object({
  quotaBytes: z.int().nonnegative(),
  usedBytes: z.int().nonnegative(),
  universes: z.array(
    z.object({ id: z.uuid(), slug: z.string(), name: z.string(), bytes: z.int().nonnegative() }),
  ),
});

// ---- the admin screens (M8-T13, ux.md §13) -------------------------------------------------

/** One account, as the Accounts screen lists it. */
export const AdminUserRead = z.object({
  id: z.uuid(),
  username: Username,
  role: SiteRole,
  createdAt: timestamp,
  lastLoginAt: timestamp.nullable(),
  /** Set: the account can't sign in. */
  disabledAt: timestamp.nullable(),
  universesOwned: z.int().nonnegative(),
  mediaUsedBytes: z.int().nonnegative(),
  mediaQuotaBytes: z.int().nonnegative(),
});

/**
 * What an admin may change about an account. Changing the role or disabling needs a current
 * code; the last admin can't be demoted or disabled.
 */
export const AdminUserUpdate = z
  .strictObject({
    role: SiteRole.optional(),
    disabled: z.boolean().optional(),
    mediaQuotaBytes: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .refine((update) => Object.keys(update).length > 0, 'Send at least one field to change.');

/** Making an invite: the new account's role. */
export const AdminInviteCreate = z.strictObject({ role: SiteRole });

/** An invite or reset link, shown once: its address and when it stops working. */
export const AdminLinkRead = z.object({ url: z.string(), expiresAt: timestamp });

/** One universe, as the Universes screen lists it: about it, never what's in it. */
export const AdminUniverseRead = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  owner: Username.nullable(),
  visibility: z.enum(['private', 'link', 'public']),
  objectCount: z.int().nonnegative(),
  mediaBytes: z.int().nonnegative(),
  /** When anything in it last changed. */
  lastChangeAt: timestamp,
});

/**
 * An admin's change to a universe: hand it to an account (whose owner keeps no access; needs a
 * current code), or make it private (a takedown).
 */
export const AdminUniverseUpdate = z.union([
  z.strictObject({ owner: Username }),
  z.strictObject({ visibility: z.literal('private') }),
]);

/** One row of the access log (`GET /admin/events`), newest first. */
export const AccessEventRead = z.object({
  id: z.uuid(),
  /** Who did it: their username at the time, `local` or `cli`. */
  actor: z.string(),
  action: z.enum(ACCESS_EVENT_ACTIONS),
  /** The account it concerns, by its username now, if it still exists. */
  user: Username.nullable(),
  /** The universe it concerns, by its address now, if it still exists. */
  universe: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
});
