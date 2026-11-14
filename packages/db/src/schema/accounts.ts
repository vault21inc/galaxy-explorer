import {
  ACCOUNT_LINK_PURPOSES,
  MEMBER_ROLES,
  SITE_ROLES,
  TOKEN_SCOPES,
  USERNAME_PATTERN,
} from '@ge/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea, idColumn, matches, oneOf, subsetOf } from './helpers.ts';

/**
 * Accounts and signing in (M8-T1, data-model §3.8, D-34). These tables are **not** audited:
 * they aren't content, nothing in them is undone through History, and a password hash has no
 * business in `change_log`. Account and access changes get their own log, `access_events`
 * (M8-T12, T13).
 */

/** Two GiB: each account's media quota until an admin changes it (M8-T11, T13). */
const DEFAULT_MEDIA_QUOTA_BYTES = 2 * 1024 ** 3;

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    username: text().notNull(),
    role: text().notNull().default('member'),
    /** argon2id, in its PHC string form (algorithm, parameters, salt and hash together). */
    passwordHash: text().notNull(),
    /** The TOTP secret, sealed with a key derived from GE_SESSION_SECRET (auth/crypto.ts). */
    totpSecretEnc: bytea().notNull(),
    /**
     * The time step (30-second window) of the last code accepted, so a code can't be used
     * twice (RFC 6238 §5.2): someone who watched it being typed can't replay it.
     */
    totpLastStep: bigint({ mode: 'number' }),
    mediaQuotaBytes: bigint({ mode: 'number' }).notNull().default(DEFAULT_MEDIA_QUOTA_BYTES),
    /** Set: the account can't sign in, and its sessions and tokens stop at once. */
    disabledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique('users_username_uq').on(t.username),
    check('users_username_check', matches(t.username, USERNAME_PATTERN)),
    check('users_role_check', oneOf(t.role, SITE_ROLES)),
  ],
);

/**
 * Signed-in browsers. The cookie holds a random token; only its SHA-256 is stored, so a copy of
 * the database can't be used to sign in. `id` names a session to its account (signing out one
 * device) without revealing anything about the token.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: idColumn(),
    tokenHash: bytea().notNull(),
    userId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Slides forward as the session is used (auth/sessions.ts). */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    userAgent: text(),
  },
  (t) => [
    unique('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

/**
 * API tokens (M8-T2, D-34): an agent's way in, acting for the account that made it, never more
 * than that account may do at the moment of each request, and narrowed by its scopes and, if
 * set, to one universe. Only the token's SHA-256 is stored, as for sessions; the token itself
 * is shown once, when it's made. Revoking one sets `revokedAt`: it stops at once.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: idColumn(),
    userId: uuid().notNull(),
    /** What its account calls it, such as 'claude-code on laptop': shown in History. */
    name: text().notNull(),
    tokenHash: bytea().notNull(),
    /** `TOKEN_SCOPES` in @ge/domain: a read token's are `{read}`, a write token's `{read,write}`. */
    scopes: text().array().notNull(),
    /** The one universe it may reach; null for every universe its account can. */
    universeId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Noted at most every few minutes, so that using a token doesn't mean writing each time. */
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique('api_tokens_token_hash_uq').on(t.tokenHash),
    index('api_tokens_user_idx').on(t.userId),
    check('api_tokens_scopes_check', subsetOf(t.scopes, TOKEN_SCOPES)),
    check('api_tokens_name_check', sql`length(${t.name}) between 1 and 60`),
  ],
);

/**
 * Single-use links an admin hands over: an invite makes an account; a reset sets a new password
 * and new two-factor codes for an existing one. Like sessions, only the token's hash is stored,
 * and the link itself is shown once.
 */
export const accountLinks = pgTable(
  'account_links',
  {
    id: idColumn(),
    tokenHash: bytea().notNull(),
    purpose: text().notNull(),
    /** An invite's new account's role. */
    role: text(),
    /** A reset's account. */
    userId: uuid(),
    createdBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique('account_links_token_hash_uq').on(t.tokenHash),
    check('account_links_purpose_check', oneOf(t.purpose, ACCOUNT_LINK_PURPOSES)),
    check('account_links_role_check', oneOf(t.role, SITE_ROLES)),
    check(
      'account_links_invite_role_check',
      sql`(${t.purpose} = 'invite') = (${t.role} is not null)`,
    ),
    check(
      'account_links_reset_user_check',
      sql`(${t.purpose} = 'reset') = (${t.userId} is not null)`,
    ),
  ],
);

/**
 * Who a universe is shared with (M8-T11, D-34): editors change its content, viewers read it.
 * Its owner is `universes.owner_id`, not a row here. Not audited, like the other account
 * tables: sharing isn't undone through History, and M8-T12 logs it in `access_events`.
 */
export const universeMembers = pgTable(
  'universe_members',
  {
    universeId: uuid().notNull(),
    userId: uuid().notNull(),
    role: text().notNull(),
    addedBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'universe_members_pk', columns: [t.universeId, t.userId] }),
    index('universe_members_user_idx').on(t.userId),
    check('universe_members_role_check', oneOf(t.role, MEMBER_ROLES)),
  ],
);

/**
 * Account and access changes, by owners and admins (M8-T12, T13): who shared a universe with
 * whom, made it public, replaced its link, transferred or deleted it. The admin screens' log.
 * Content changes stay in `change_batches`, and none of this can be undone through History.
 *
 * The rows outlive what they're about: deleting an account or a universe sets its id to null,
 * so `actor_label` and `detail` keep the names as they were.
 */
export const accessEvents = pgTable(
  'access_events',
  {
    id: idColumn(),
    actorId: uuid(),
    /** The actor's username at the time, or 'local' on your own machine, or 'cli'. */
    actorLabel: text().notNull(),
    /** `ACCESS_EVENT_ACTIONS` in @ge/domain, such as 'member.add'. */
    action: text().notNull(),
    /** The account it concerns, if any: the member added, the new owner. */
    userId: uuid(),
    universeId: uuid(),
    /** What changed, such as `{ "from": "private", "to": "public" }`, with names, not only ids. */
    detail: jsonb().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('access_events_created_idx').on(t.createdAt.desc()),
    index('access_events_universe_idx').on(t.universeId),
  ],
);
