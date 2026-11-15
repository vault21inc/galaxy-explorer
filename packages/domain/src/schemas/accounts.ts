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
 * `totp` is for an account with two-factor codes on (D-47): without it, the right password gets
 * a 401 whose `errors` name `/totp`, asking for the code.
 */
export const LoginRequest = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  totp: z.string().min(1).max(16).optional(),
});

/** The signed-in account (`GET /auth/me`). */
export const AccountRead = z.object({
  id: z.uuid(),
  username: Username,
  role: SiteRole,
  /** How much media the universes it owns may hold together, and how much they do (M8-T11). */
  mediaQuotaBytes: z.int().nonnegative(),
  mediaUsedBytes: z.int().nonnegative(),
  /**
   * Whether the account has two-factor codes on (D-47). With them, signing in and the
   * confirmations ask for a code; without, the confirmations ask for the password.
   */
  twoFactor: z.boolean(),
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

/**
 * The first step of an account link: the username (an invite only), the password, and whether to
 * set up two-factor codes now (D-47). They can be turned on later from the account page; a
 * client that doesn't say gets them, as before they were optional.
 */
export const AccountLinkStart = z.strictObject({
  username: Username.optional(),
  password: Password,
  twoFactor: z.boolean().default(true),
});

/**
 * A new two-factor secret, for an authenticator app. Nothing is saved yet: `setup` carries it,
 * sealed by the API, and comes back with the first code, which proves the app has it. `qrCode`
 * is the otpauth URI as an SVG image (a data URL), for the app to scan; `secret` is the same,
 * to type in instead.
 */
export const TwoFactorSetup = z.object({
  setup: z.string(),
  secret: z.string(),
  otpauthUri: z.string(),
  qrCode: z.string(),
});

/**
 * What the first step returns. `setup` also carries the chosen username and the password's hash.
 * Without two-factor codes the rest is null, and `finish` takes the setup alone.
 */
export const AccountLinkSetup = z.object({
  setup: z.string(),
  secret: z.string().nullable(),
  otpauthUri: z.string().nullable(),
  qrCode: z.string().nullable(),
});

/**
 * The second step: the sealed setup, and one code from the app if the first step set up
 * two-factor codes.
 */
export const AccountLinkFinish = z.strictObject({
  setup: z.string().min(1).max(4096),
  totp: TotpCode.optional(),
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
  'user.two-factor.on',
  'user.two-factor.off',
  'token.create',
  'token.revoke',
] as const;
export type AccessEventAction = (typeof ACCESS_EVENT_ACTIONS)[number];

// ---- the account page (M8-T13, ux.md §13) --------------------------------------------------

/** Changing one's password: the current one, the new one, and a current code if two-factor is on. */
export const PasswordChange = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: Password,
  totp: TotpCode.optional(),
});

/** Turning two-factor codes on (D-47): the setup from `POST /auth/two-factor/setup`, and a code. */
export const TwoFactorEnable = z.strictObject({
  setup: z.string().min(1).max(4096),
  totp: TotpCode,
});

/** Turning them off: the password and a current code, so a browser left signed in can't. */
export const TwoFactorDisable = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
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
  /** Whether the account has two-factor codes on (D-47). */
  twoFactor: z.boolean(),
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

// ---- API tokens (M8-T2, data-model §3.8, ux.md §13) ----------------------------------------

/**
 * What a token may do, on top of whatever its account may do at the moment of each request:
 * `read` reads as a viewer would; `write` also changes content. Stored as `scopes` (a `write`
 * token's are `read` and `write`); the API speaks of one scope, the larger.
 */
export const TOKEN_SCOPES = ['read', 'write'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export const TokenScope = z.enum(TOKEN_SCOPES);

/**
 * A token's text: `ge_` and 32 random bytes in URL-safe base64. The prefix lets people (and
 * secret scanners) tell a Galaxy Explorer token when they see one.
 */
export const API_TOKEN_PATTERN = '^ge_[A-Za-z0-9_-]{43}$';

/** Making a token: its name, its scope and, optionally, the one universe it's for. */
export const ApiTokenCreate = z.strictObject({
  name: z.string().trim().min(1, 'Give the token a name.').max(60),
  scope: TokenScope,
  /** Null or left out: every universe the account can reach. */
  universeId: z.uuid().nullable().optional(),
});

/** A token as the account page lists it. The token itself is shown only once, when it's made. */
export const ApiTokenRead = z.object({
  id: z.uuid(),
  name: z.string(),
  scope: TokenScope,
  /** The one universe it's for, by id and address; null for every universe. */
  universe: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }).nullable(),
  createdAt: timestamp,
  lastUsedAt: timestamp.nullable(),
});

/** A token just made: its record, and the token itself, which is never shown again. */
export const ApiTokenCreated = z.object({ token: ApiTokenRead, secret: z.string() });

/** The token a request is made with, and its account (`GET /auth/token`). */
export const CurrentTokenRead = ApiTokenRead.extend({ username: Username });
