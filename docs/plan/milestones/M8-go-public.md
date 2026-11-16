# M8: Going public

**Goal:** a secure, backed-up public site on one DigitalOcean droplet, where:
- anonymous visitors explore public universes' published content;
- invited accounts sign in with a password and two-factor codes and build their own universes, private until shared or published (D-34);
- a universe's owner shares it with other accounts as editors or viewers, or by a link;
- admins manage accounts from an admin screen;
- LLM agents use revocable tokens that act for an account;
- the content built locally is carried over;
- newcomers can learn the app from guided tours (D-30).

**Depends on:** M6, plus M7-T4 for the content migration and M7-T7 for remote MCP.
**Read first:** [architecture.md §7, §8, §14](../architecture.md), [data-model.md §3.8, §8](../data-model.md), [ux.md §13](../ux.md#13-accounts-sharing-and-admin-m8), [decisions.md T6, X5, D-15, D-19, D-34](../decisions.md).
**Demo at the end:**
1. `https://<domain>` serves the galaxy with an A+ TLS rating.
2. Anonymous visitors see public universes' published content only.
3. The owner, as the first admin, logs in with password and TOTP and edits.
4. The admin invites a second account from the admin screen. It signs up through the link, sets up TOTP, and creates a universe that nobody else can see or find.
5. That account shares its universe: a viewer can read it, an editor can change it, and a link opens it in a signed-out browser until the link is replaced.
6. The admin disables the second account: its session and tokens stop at once.
7. An agent with a write token creates an object over remote MCP; revoking the token stops it.
8. Last night's backup restores into a scratch database.
9. A first-time visitor takes the reader tour. An account takes the editor tour in a private practice universe, then deletes it.

**Before starting:** the owner picks a domain name and creates a DigitalOcean account and a Spaces bucket. Budget is not a constraint (X5).

**Order:** T1, T11, T12, T13, then T2 to T10. T11 to T13 were added by D-34 after T2 to T10 were numbered; the numbers stay, so other documents' references still hold. T7 waits on a Spaces bucket from the owner, so T8 and T9 went first (2026-11-15), and T7 comes in when the bucket is ready. T10 stays last.

---

### M8-T1 Accounts and login

**Where:** `packages/db` (migration), `apps/api/src/auth/`, `apps/api/src/routes/auth.ts`, `apps/web/src/pages/login-page.tsx`, `src/pages/account-link-page.tsx`.

- Add the `users`, `sessions` and `account_links` tables (data-model §3.8) in a migration. They are **not** audited.
- **The first admin** comes from the command line: `pnpm admin:create-user --admin` prompts for a username and password and then sets up TOTP. It prints the otpauth URI and a QR code in the terminal, and requires one valid code before saving. `pnpm admin:reset-link <username>` prints a reset link, for an admin who is locked out, and `pnpm admin:invite [--admin]` prints an invite link. AGENTS.md's command table gains all three.
- Passwords are hashed with argon2id (`@node-rs/argon2`) and must be at least 12 characters. TOTP uses `otplib`, with a ±1 step window. The TOTP secret is encrypted with a key derived from `GE_SESSION_SECRET`.
- `POST /api/v1/auth/login` takes `{ username, password, totp }`. On success it sets a session cookie:
  - `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`;
  - valid for 30 days, with sliding renewal;
  - stored only as a hash.
- `POST /auth/logout`; `GET /auth/me` (username, role, quota used); `GET/DELETE /auth/sessions` (the account's signed-in devices).
- **Invite and reset links** (`account_links`): single-use, stored as a hash, 7 days for an invite and 24 hours for a reset.
  - `GET /auth/links/{token}` says what the link is for, or that it's used or expired.
  - `POST /auth/links/{token}/start` takes the username (an invite) and the password, checks them, and returns a new TOTP secret.
  - `POST /auth/links/{token}/finish` takes one valid code. Only then is the account created, or its password and TOTP replaced, and the link used up. A reset also signs out every session of the account.
  - The pages for both are `/link/{token}` (ux.md §13). Making the links is T13's.
- A disabled account (`disabled_at`) can't sign in, and its sessions and tokens are refused from the next request.
- Login and link routes are rate-limited (5 attempts per 15 minutes per IP and per username or link) and fail with a generic message.
- **Mutations check `Origin`** against `GE_PUBLIC_URL`, protecting against CSRF together with `SameSite`.
- **A current two-factor code** can be required by a route (a `requireFreshTotp` guard): the request carries a code, checked like a login's. T12 and T13 use it for destructive actions.
- `GE_AUTH_MODE=required`:
  - a request is an account (session or token) or anonymous; what it may do in a universe is T11's;
  - `/api/health` reports `authMode`;
  - until T11 lands, any signed-in account may edit and anonymous visitors read published content, as the single-owner plan had it.
- A login page at `/login`, built with shadcn components, and the account menu in the top bar (username, Sign out; "Sign in" when signed out).

**Done when:**
- [x] Integration tests cover: a wrong password; a wrong or old TOTP code; a successful login; an expired session; logout; a cross-origin mutation rejected; an invite accepted once and refused the second time; an expired link; a taken username; a reset that replaces the password and TOTP and ends the account's sessions; a disabled account's session and login refused; the rate limit.
- [x] E2E: the admin logs in and edits; logged out, the edit toggle is gone. An invite link (made with `pnpm admin:invite` in the test's setup) leads through username, password and TOTP to a signed-in account.

**As built:**
- **Where:** `apps/api/src/auth/` holds the parts:
  - `crypto.ts`: tokens and sealing;
  - `passwords.ts`, `totp.ts`, `attempt-limiter.ts`;
  - `sessions.ts`, `sign-in.ts`, `links.ts`;
  - `requester.ts`, the per-request hook;
  - `cli.ts`, the admin commands.

  The routes are in `routes/auth.ts`. The web pages are `pages/login-page.tsx` and `pages/account-link-page.tsx` (with `pages/account-link/`), and the menu is `app/account-menu.tsx`.
- **Who's asking:** the hook sets `request.account`, `request.actor` and `request.canEdit` once per request.
  - Readers' draft filtering takes `request.actor`, and `actorOf` refuses an anonymous visitor.
  - `/api/health`'s `canEdit` and the export routes read `request.canEdit`.
  - T11 replaces `canEdit` with `universeAccess`.
- **Different from the plan:**
  - **`sessions` has an `id`**, so a device can be signed out without exposing its token's hash. It also has `last_seen_at`, for the devices list. The session slides forward at most once every 5 minutes, so reading doesn't mean writing on every request.
  - **`users.totp_last_step`** makes each code work once (RFC 6238 §5.2). A replayed code fails, even inside its 30 seconds.
  - **A link's two steps keep nothing in the database between them.** `start` returns the chosen username, the password's hash and the new secret, sealed with a key derived from `GE_SESSION_SECRET` (AES-256-GCM, 30 minutes). `finish` opens them. So `account_links` needs no pending columns, and an abandoned step leaves nothing behind.
  - **`GET /auth/me` answers `{ data: null }`** when signed out, rather than a 401, so a signed-out page logs no errors.
  - **"Quota used" moves to T11,** which gives universes owners; `/auth/me` returns the quota only.
  - **The cookie is `Secure` whenever `GE_PUBLIC_URL` is https,** which production always is. Over http on localhost it isn't, because WebKit won't send a `Secure` cookie there.
  - **Config:** `GE_TRUST_PROXY` is new, so behind Caddy the rate limits see the visitor's address rather than the proxy's. Blank values in a `.env` count as unset.
- **`requireFreshTotp(auth)`** is a route guard reading the code from the `X-GE-TOTP` header. No route uses it yet; T12 and T13 will.
- **Rate limits:** failures are counted, not attempts, in memory, per address and per username or link. A successful sign-in clears its username's count. T3 adds the general limit.
- **Signing in, signing out and finishing a link** put the account straight into the web app's cache and refetch everything else in the background, without waiting. Finishing a link used to wait for every query, the link's own among them. The link now read "used", and when that answer came back first, the page swapped to "This link was used" before it could navigate (fixed 2026-11-14, after M8-T12's full e2e run caught it).
- **The account menu** has only Sign out until T13 adds Account and Admin. "New universe" on the home page now shows only to someone who may edit.
- **Tests:**
  - **Integration:** `apps/api/test/auth/sign-in.int.test.ts` and `links.int.test.ts` (16 tests), plus a config test. They cover every item above, and also: each code used once, the devices list and signing devices out, a forged or crossed setup refused, History recording the account, and 404s with `GE_AUTH_MODE=none`.
  - **E2E:** `apps/web/e2e/accounts.spec.ts` runs against a second API with `GE_AUTH_MODE=required` (port 3108, database `ge_e2e_auth`), behind a second preview server (4174) of the same build. It also checks the login and link pages with axe.
  - **Typing:** `e2e/tsconfig.json` gives only the tests Node's types, for `pnpm admin:invite` and a hand-written RFC 6238 code generator.
- **Later (2026-11-15, the owner's choice, D-47): two-factor codes are optional, per account.**
  - `users.totp_secret_enc` may be null (migration 0011): codes off, and the account signs in with its password alone. With codes on, the right password without a code gets a 401 naming `/totp`, and `/login` shows the code field only then.
  - An invite or reset link's first step has a switch, "Set up two-factor codes now", off by default; without codes it's the only step. `start` takes `twoFactor` (an API client that doesn't say gets codes), and `finish` takes no code when there's no secret. A reset without codes turns them off. `pnpm admin:create-user` asks, yes by default for an admin.
  - The destructive actions' confirmation (`requireConfirmation`, formerly `requireFreshTotp`) takes a code in `X-GE-TOTP`, or, for an account with codes off, the password in `X-GE-Password`, percent-encoded and redacted from the API's log. The web dialogs ask for whichever the account needs (`components/confirmation-field.tsx`). Changing the password needs a code only with codes on.
  - The account page's Two-factor codes section turns them on (`POST /auth/two-factor/setup`, then `enable` with one code) and off (`disable`, with the password and a code), logged as `user.two-factor.on` and `.off`. The admin Accounts table shows each account's codes.
  - Tests: `apps/api/test/auth/two-factor.int.test.ts` (7); `accounts.spec.ts` gains an account without codes that confirms with its password and turns codes on; `admin.spec.ts`'s invitee joins without codes.

### M8-T11 Ownership, visibility and the access check

**Where:** `packages/db` (migration), `apps/api/src/services/access.ts`, `services/visibility.ts`, every service's entry points, `apps/api/test/contract/access.contract.int.test.ts`.

- **Migration:** `universes.owner_id`, `visibility` and `share_key`, and the `universe_members` table (data-model §3.1, §3.8). Existing universes become `public` with no owner; new ones are `private` and belong to the account that makes them.
- **The viewer:** today's `Viewer` (`includeDrafts`) becomes "who is asking": the account and its site role, the share keys the browser has unlocked, or nobody. It's resolved once per request in a Fastify hook.
- **`universeAccess(viewer, universe)`** returns `none`, `read`, `edit` or `own` (data-model §8), and is the only place that decides. Every service call that touches a universe asks it:
  - reads need `read`, and see drafts only from `edit`;
  - content writes, uploads, History and revert need `edit`;
  - the universe's address, visibility, members, transfer and deletion need `own`;
  - `none` is a 404, on every route. A 403 is for someone who can read but may not do that.
- **Everything reaches its universe through its own row:** a map, entity, asset, batch or settings record is loaded first, and its `universe_id` is what's checked. The batch endpoint checks every operation's universe before running any.
- **Lists:** `GET /universes` returns public universes, plus the requester's own and those shared with them: it feeds the home page and the switcher. `UniverseRead` gains `visibility`, `owner` (the username, or null) and `access` (the requester's).
- **Addresses:** `GET /universes/by-slug/{slug}` answers for anyone with `read`, and the universe pages resolve `/u/{slug}` with it instead of searching the list, so a link-only universe opens without being listed. Addresses stay global, first come, first served: a taken slug says it's taken, which reveals that the address exists and nothing else.
- **Creating a universe** needs an account, which becomes its owner. Importing (M7-T4) and the practice universe (T10) follow the same rule.
- **History** records the account: `actor_type = 'user'` with its id and username, or `'api_token'` with the token's name and its account's.
- **Media:** `/media/u/{universeId}/…` is served only with `read` on that universe. In development and tests Fastify's own route checks; `GET /api/v1/media-access` answers the same question for Caddy's `forward_auth` (T4). Non-public universes' files get `Cache-Control: private`.
- **Media quota:** an upload that would take the owner past `media_quota_bytes` is refused with a 413 that says how much is used. `GET /auth/me` gains `mediaUsedBytes`, the media of the universes the account owns (moved here from T1).
- **The web app:** the edit toggle follows the universe's `access` (from `edit` up) instead of `/api/health`'s `canEdit`; a universe the requester can't read shows the ordinary "not found" page, with "Sign in" if they're signed out; the home page lists Your universes, Shared with you and the public ones (ux.md §13).
- **AGENTS.md:** the Security rules gain "every service call that touches a universe asks `universeAccess`; a universe the requester can't read is a 404".

**Done when:**
- [x] The access contract suite walks the OpenAPI document, with no route listed by hand: for every route with a universe, map, entity, asset, batch or settings record in its path, on a private universe a stranger and an anonymous visitor get 404, a viewer reads and gets 403 on every write, an editor writes but gets 403 on address, visibility, members, transfer and delete, and the owner may do all of it. A route the suite can't classify fails it.
- [x] Integration tests: drafts are hidden from viewers and shown to editors; `GET /universes` lists exactly what each kind of requester can read; a batch touching two universes, one of them not editable, changes nothing; a private universe's media file is 404 for a stranger and served to a viewer; an upload past the quota is refused.
- [x] E2E: an account's new universe is private, and a signed-out browser gets "not found" at its address; made public, it appears on the home page for everyone.
- [x] With `GE_AUTH_MODE=none`, every existing test passes unchanged, with two exceptions that test the same behaviour by new names. An API test of the drafts filter calls the renamed `viewerFor` (was `visibleTo`). `navigation.spec.ts`'s failed-request test now fails the request the universe page makes, `/universes/by-slug/{slug}`, instead of the list.

**As built:**
- **One check, in front of every route (D-40):** a `preValidation` hook (`http/access-guard.ts`), rather than a call at each service's entry.
  - It finds the universe from the route's path parameters (`http/route-universe.ts`): a `mapId` in `maps`, an entity's `id` in `entities`, a settings row's `id` in its table, and so on. The universe always comes from the row itself, and all the rows a path names must agree.
  - It asks `universeAccess` (`services/access.ts`), and answers 404 for `none`. The message is exactly a missing row's: "No map with id …".
  - For a level too low it answers 403, or 401 when signed out.
  - It runs before the route's validation, so a refused request is refused whatever its body says.
- **Each route's level** defaults to `read` for GET and `edit` otherwise. A route says more in its schema as `x-ge-access`, which also lands in the OpenAPI document:
  - History, exports and the image library need `edit`;
  - deleting the universe needs `own`;
  - its `slug` and `visibility` are `ownFields`.

  Routes about no single universe say `open` (health, icons, signing in, the lists, `by-slug`, `media-access`) or `editor` (creating a universe, the batch endpoint, the wiki). A route that does neither, or has a path parameter the guard doesn't know, is refused with a 500 until it's taught.
- **The batch endpoint** checks every operation's `mapId`, `universeId` and `id` before running any (`services/batch-access.ts`), and names the refused operation.
- **Who's asking** is `request.requester` (local, an account, or anonymous, with the share keys T12 will unlock). The services' `Viewer` stays what it was, the drafts filter: `viewerFor(access, { includeDrafts })` honours drafts from `edit` up. A viewer who asks for drafts gets 403.
- **Found by the contract suite and fixed:**
  - links and relations were updated and deleted by their own id alone, so one of another universe's entities could be reached through an entity the requester could edit. They're now found through the path's entity too.
  - `PATCH` with an empty body was a 500 on images, links, relations and assets; it's now a 400.
  - deleting a settings row still in use (a group type with groups) was a 500; RESTRICT foreign keys now answer 409.
- **Universes:**
  - `GET /universes/by-slug/{slug}` is new; the web app resolves `/u/{slug}` with it.
  - New universes belong to the account that makes them, private. Locally, and for the seeds, they're the installation's own: no owner, public.
  - `UniverseRead` gains `visibility`, `owner` and `access`. Services return a `UniverseRecord` with `ownerId`, and only the routes add who's asking.
  - `PATCH` takes `visibility` now, for the e2e test and T12. Choosing `link` makes a share key; leaving `link` drops it.
- **Media:**
  - `/media/*` is served only with `read`, with `Cache-Control: public` for public universes and `private` otherwise.
  - `GET /api/v1/media-access` answers the same for Caddy, from `X-Forwarded-Uri`, with 204 and the `Cache-Control` to send.
  - Uploads past the owner's quota get a 413, and `GET /auth/me` reports `mediaUsedBytes`.
- **Admins** own the installation's own universes (no owner), and nothing else.
- **Every route documents 401 and 403,** which is most of the regenerated client's growth.
- **The web app:**
  - **Edit mode** follows the universe's `access` (`useCanEdit`). `useCanCreate` (health's `canEdit`) decides "New universe".
  - **The home page** lists Your universes, Shared with you (with the role) and Public universes, with Private and Link-only badges and "by {owner}".
  - **"Not found"** offers "Sign in" to a signed-out reader.
- **Tests:**
  - `apps/api/test/contract/access.contract.int.test.ts`, with its world in `access-world.ts`. It checks each route's declared level against data-model §8's rule worked out on its own, and it fails when a level is lowered.
  - `apps/api/test/access.int.test.ts` (9 tests).
  - `apps/web/e2e/universe-access.spec.ts`, and `test/home-sections.test.ts`.

### M8-T12 Sharing: editors, viewers and links

**Where:** `apps/api/src/routes/sharing.ts`, `apps/web/src/pages/universe-settings/sharing-section.tsx`.

- **Members:** `GET /universes/{universeId}/members`; `PUT /universes/{universeId}/members/{username}` with `{ role }` adds an account or changes its role; `DELETE` removes it. The owner manages them; a member may remove themself ("Leave this universe"). A username that doesn't exist is a 404 that says so; nothing lists or suggests accounts.
- **Visibility:** the owner sets `private`, `link` or `public` with `PATCH /universes/{universeId}`.
  - Choosing `link` creates the share key; `POST /universes/{universeId}/share-key` replaces it, which stops the old link.
  - The share link is `/u/{slug}?k={key}`. The web app sends the slug and the key to `POST /universes/unlock` (a visitor with only the link doesn't know the universe's id), which sets an `HttpOnly` cookie carrying the key for that universe. The API checks the cookie's key against the current one on every request, so a replaced key locks out everyone who had the old link. The key stays in the address while the reader moves around (as `perf` does), so the address bar can be passed on.
  - Link-only and private universes are sent with `X-Robots-Tag: noindex`.
- **Transfer:** `POST /universes/{universeId}/transfer` with `{ username }` and a current two-factor code makes that account the owner, if its quota has room; the previous owner becomes an editor.
- **Deleting a universe** asks for its name (as today) and a current two-factor code.
- **Every change here is recorded** in `access_events` (who, what, which account, which universe).
- **The Sharing section** of the universe's settings page (ux.md §13): Who can see it, the link with Copy and "Make a new link", People, Transfer and Delete. Editors see it read-only, with "Leave this universe".

**Done when:**
- [x] Integration tests: adding, changing and removing members; a member leaving; only the owner managing; an unknown username; the unlock cookie reading a link-only universe and failing after the key is replaced; transfer with and without room in the quota; each change's `access_events` row.
- [x] E2E, with separate browser contexts: the owner adds a viewer and an editor; the viewer reads but has no edit toggle and sees no drafts; the editor edits, and History shows their name; a signed-out browser opens the share link, keeps the key while entering a system, and gets "not found" once the link is replaced.

**As built:**
- **Where:** the routes are `routes/sharing.ts` and the universe's `PATCH` and `DELETE` in `routes/containers.ts`; the work is `services/sharing-service.ts`, and the log `services/access-events.ts`. The web app's section is `pages/universe-settings/` (`sharing-section.tsx` and one file per part), with its hooks in `api/sharing.ts`.
- **Who may reach a universe isn't content (D-41).** Found while building this: universes are audited, so an editor could have reverted, through History, the batch that made a universe private, or the one that handed it over, or the one that created it (which deletes it). Now:
  - migration 0009 leaves `owner_id`, `visibility` and `share_key` out of History: an update that changes only those isn't logged and needs no change batch, a revert compares rows without them, and a row written back keeps their current values;
  - changing only the visibility makes no batch and doesn't bump the version;
  - with accounts, History refuses to revert a batch that made or deleted a universe (422): it's deleted only from its settings, with its name and a code.
- **Routes:**
  - `GET /universes/{universeId}/members` needs `edit`, since editors see the section read-only; `PUT` and `DELETE …/members/{username}` need `own`.
  - **Leaving is its own route,** `DELETE /universes/{universeId}/membership`, at `read`, rather than `DELETE …/members/{yourself}`. The contract suite gives each route one level, and "the owner, or yourself" isn't one. The owner can't leave (422).
  - `POST …/share-key` (own), `POST …/transfer` (own, with `X-GE-TOTP`), and `POST /universes/unlock` (open).
  - `GET /universes/{universeId}/drafts` (edit) is new: it counts draft maps and entries, for "Make it public?".
  - These routes need a signed-in session (`requireSession`), as does a `PATCH` that changes the visibility. M8-T2's tokens won't reach them.
  - Removing someone who isn't a member is a 404 that says so. Adding the owner as a member, or transferring to the owner, is a 422.
- **The share link:**
  - `UniverseRead` gains `shareKey`, sent only to the owner, and `role`, the requester's membership.
  - Unlocking sets `ge_share_{universeId}` (`HttpOnly`, `SameSite=Lax`, 30 days). The requester hook reads every such cookie, and `universeAccess` compares each with the current key.
  - The web app unlocks when the address has `k`, and falls back to the address lookup if the key is old.
  - `k` is kept with `perf` by one helper (`lib/kept-params.ts`): between views, maps, the palette's commands and the `/u/{slug}` redirect. It's dropped when going to another universe.
- **`noindex`:** the access guard, `by-slug`, `unlock` and the media files send `X-Robots-Tag: noindex` for private and link-only universes. The page also gets a `<meta name="robots">` while one is on screen, because crawlers judge the HTML.
- **Transfer:** the new owner's quota must fit the universe's images. The previous owner becomes an editor (for an unowned universe, the admin who handed it over does), and the new owner's membership goes.
- **Deleting a universe** needs a fresh code, and is logged with its slug and name, which stay after its id becomes null. Locally there's no code, and the Sharing section offers only Delete, which the settings page had no button for before.
- **Viewers** don't see the settings page: it says whose the universe is, with "Leave this universe".
- **Tests:**
  - **Integration:** `apps/api/test/sharing.int.test.ts` (9 tests), covering each item above. It also checks that an editor can't revert a universe's creation, that undoing an edit after a visibility change keeps the visibility, the `noindex` headers, and the drafts count.
  - **The contract suite** knows `{username}`, and data-model §8's rule for the new routes. It shares the universe again after every write, since an allowed request may remove a member.
  - **E2E:** `e2e/sharing.spec.ts`, and Delete in `universe-settings.spec.ts` (no accounts). Delete and Transfer aren't run end to end with accounts: the test's sign-in already used the next 30-second step's code, so a fresh one would mean waiting up to 30 seconds. The integration tests cover both.
  - **Unit:** `test/kept-params.test.ts`.

### M8-T13 Account page and admin screens

**Where:** `apps/api/src/routes/admin.ts`, `apps/web/src/pages/account-page.tsx`, `src/pages/admin/`.

- **Account page** (`/account`, ux.md §13): change the password (current password and a code); signed-in devices, with sign-out for each or all others; storage used, by universe. T2 adds the API tokens here.
- **Admin routes,** for accounts with the `admin` role and a session (never a token):
  - `GET /admin/users`: username, role, last sign-in, universes owned, storage used and quota, status;
  - `POST /admin/invites` with `{ role }` returns the invite link, once;
  - `POST /admin/users/{userId}/reset-link` returns a reset link, once;
  - `PATCH /admin/users/{userId}`: role, disabled or enabled, media quota. The last admin can't be disabled or demoted;
  - `DELETE /admin/users/{userId}`: only once the account owns no universes;
  - `GET /admin/universes`: name, owner, visibility, object count, storage, last change, without their content;
  - `PATCH /admin/universes/{universeId}`: transfer to an account (the previous owner keeps no access), or make it private (a takedown); `DELETE` removes it;
  - `GET /admin/events`: the `access_events` log, newest first, paged.
- Disabling, deleting, a role change, a reset link, a transfer and deleting a universe each need a current two-factor code, and each is recorded in `access_events`.
- **An admin gets no access to other accounts' private universes** from these routes: the universes list has no content, and opening one goes through `universeAccess` like anyone's request.
- **Admin screens** (`/admin`, ux.md §13): Accounts, Universes and Log, as tables with their actions; links are shown once with a Copy button.

**Done when:**
- [x] Integration tests: a member and a token get 404 on every admin route; inviting, resetting, disabling and enabling, the role change and the last-admin rule; deleting an account that owns universes is refused; an admin reading another account's private universe gets 404, before and after listing it; transfer and takedown; each action's `access_events` row. (Tokens don't exist until M8-T2: the admin scope needs a session, which a token never has, and T2's tests try one on these routes.)
- [x] E2E: the admin invites an account from the Accounts screen; the invitee signs up through the link and creates a private universe; the admin sees it in Universes but gets "not found" at its address; the admin disables the account, and its browser is signed out at its next request.
- [x] axe finds no violations on the account page, the link pages and the admin screens.

**As built:**
- **The admin scope:** the access guard has a fourth scope, `admin` (`routeAccess({ scope: 'admin' })`). It lets through only an account with the `admin` role and a session; everyone else gets the same 404 as a route that doesn't exist, locally too. A universe in an admin route's path isn't checked through `universeAccess`, because these routes don't read content.
- **Routes** (`routes/admin.ts`, `services/admin-service.ts`):
  - **Accounts:** the list; invites (no code, the link returned once); reset links (code); `PATCH` for role, status and quota. The role and status need a code; the quota doesn't.
  - **Disabling** ends the account's sessions at once. The last admin who can sign in can't be demoted, disabled or deleted (422).
  - **Deleting an account** is refused with a 422 while it owns universes. Its name stays in the log after it's gone.
  - **Universes:** the list holds facts only: owner, visibility, object count, media and last change. `PATCH { owner }` transfers with a code, through M8-T12's `transferUniverse` with `previousOwnerKeeps: false`. `PATCH { visibility: "private" }` is the takedown, with no code; it drops the share key. `DELETE` (code) is a change batch, like the owner's delete.
  - **The log** pages newest first, by its time-ordered ids.
- **The account page's routes** (`routes/account.ts`):
  - `POST /auth/password` takes the current password and a code. It signs out every other device, logs `user.password`, and counts failures like signing in.
  - `GET /auth/storage` gives the media per owned universe.
  - Without accounts they answer 404, like the other account routes.
- **The command line's** invite and reset links are logged too, as `cli`.
- **Found on the way:** Drizzle writes a column of a one-table query as a bare `"id"`. Inside a subquery that meant the subquery's own table, which would have made storage counts wrong without failing. The outer row is now named in full there.
- **Web:**
  - `/account`: Password, Signed-in devices and Storage.
  - `/admin`: Accounts, Universes and Log tabs (Radix Tabs). To anyone but an admin it's the ordinary "Page not found".
  - Each action opens one dialog (`pages/admin/action-dialog.tsx`). It can ask for a typed confirmation (the username, or the universe's address), a value and a code, and can show a link once with Copy.
  - The account menu gains Account and Admin.
- **Tests:**
  - `apps/api/test/admin.int.test.ts` (10 tests). It forgets an account's last code between calls that need one: those tests are about the routes, and M8-T1's about codes working once.
  - `apps/web/e2e/admin.spec.ts`, with axe on the admin tabs and the account page, and `test/bytes.test.ts`.
  - The e2e helpers track each account's last code step (`nextCode`), waiting for the clock only when two codes in a row need it.

### M8-T2 API tokens and remote MCP

- Add the `api_tokens` table (data-model §3.8). A token belongs to the account that made it (D-34).
- The account page's "API tokens" (T13): create one (name, `read` or `write`, optionally one universe), show it **once**, list tokens with last use, and revoke.
- `Authorization: Bearer ge_…` authenticates as the token's account, narrowed by its scopes and universe: each request goes through `universeAccess` (T11) as that account, so a token can never do more than its account can at that moment. Revoked tokens, and tokens of a disabled account, get 401; out-of-scope requests get 403. There is no admin scope: the account, sharing and admin routes refuse tokens.
- The token's name and its account's become the batch's `actor_label` ("token: claude-code, for aemos").
- MCP: a Streamable HTTP transport mounted at `/mcp` on the API host, or as its own service behind Caddy, accepting the same bearer tokens. The stdio mode keeps working with `GE_API_TOKEN`.

**Done when:**
- [x] Integration tests: a read token can't write; a revoked token gets 401; a universe-scoped token can't touch another universe; a token loses a universe when its account loses it; a token is refused on the account, sharing and admin routes.
- [x] A remote MCP smoke test creates an object, and the History panel shows it under the token's name.

**As built (M8-T2), D-42:**
- **The table:** `api_tokens` as data-model §3.8 has it, with a name of 1 to 60 characters and at least one scope. The API speaks of one `scope`, `read` or `write`; a write token's stored scopes are both. Revoking sets `revoked_at` and keeps the row, so History's `actor_id` still names something.
- **The routes** (`routes/tokens.ts`): `GET /auth/tokens`, `POST /auth/tokens` and `DELETE /auth/tokens/{tokenId}`, with a session; making one also needs a current code in `X-GE-TOTP` (D-42). `GET /auth/token` is for a token itself: its name, scope, universe and username. Making and revoking are logged as `token.create` and `token.revoke`.
- **The narrowing is in `universeAccess`** (services/access.ts): another universe is `none`, and a read token gets `read` at most, so it reads as a viewer would (no drafts, History or export). The guard words what it can:
  - a read token's write: 403, "can only read";
  - another universe of the same account: 403, "for another universe";
  - one the account can't see: 404, as for anyone;
  - `POST /universes` with a token for one universe: 403.
- **Tokens never reach account, sharing or admin routes:** those routes declare `session: true` in `x-ge-access` (it replaces the `requireSession` pre-handlers), and the guard refuses a token with 403 there and on every `/auth/` route but `GET /auth/token`, whatever the path names. `requireFreshTotp` needs a session too. A token's requests read no cookies, so share links don't apply to them and the Origin check doesn't either.
- **Remote MCP** is its own service, `pnpm mcp:http` (apps/mcp/src/http.ts, port 3110), since apps/api may not import apps/mcp. It's stateless, with plain JSON responses. Before each request it checks the token with `GET /auth/token`, and refuses with a 401 and `WWW-Authenticate: Bearer` otherwise. It answers only to its own host names. On a loopback address, in front of an API without accounts, it needs no token. M8-T4 puts it behind Caddy at `/mcp`.
- **The account page's API tokens:** the list (what each may do, last use, Revoke) and a form (name, Read or Write, every universe or one, a code). The token is shown once with Copy; invite links share that box (`app/shown-once.tsx`). The admin Log names token events.
- **Tests:**
  - `apps/api/test/tokens.int.test.ts` (6 tests);
  - the access contract suite, with four more requesters: the owner's read token, its write token, its token for another universe, and an admin's token. It checks each route's `session` flag against architecture §7, independently, and runs in about 3.5 seconds;
  - `apps/mcp/test/http.test.ts` and an HTTP round trip in `mcp.int.test.ts`;
  - `apps/web/e2e/remote-mcp.spec.ts`: a write token made on the account page, `objects_create` over remote MCP, History showing "token: smoke-agent, for …", and a 401 once it's revoked, with axe on the account page.

### M8-T3 Security hardening

- Headers, set in Caddy, with the API as a fallback:
  - a strict `Content-Security-Policy` (`default-src 'self'`; `img-src 'self' data: blob:`; `worker-src 'self' blob:`; `connect-src 'self'`; `style-src 'self' 'unsafe-inline'` only if Tailwind or Radix need it; no inline scripts);
  - `Strict-Transport-Security`;
  - `X-Content-Type-Options`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - a `Permissions-Policy` that turns off what isn't used.
- `@fastify/rate-limit` on all routes, with stricter limits for auth, account links, adding members and uploads.
- Upload limits confirmed. `/media/*` is served with `Content-Disposition: inline` and the correct `Content-Type`, plus `X-Content-Type-Options: nosniff`.
- The XSS corpus (M1-T5) is extended to rendered pages: a Playwright test plants payloads through the API and checks that nothing executes.
- CI adds `pnpm audit --prod` (failing on high severity) and a secret scan (gitleaks).

**Done when:**
- [x] securityheaders.com rates the site A or better: A+ for the preview, 2026-11-14.
- [x] The CSP raises no violations during the golden-path e2e test against a production build.
- [x] The new CI checks run on every push.

**As built (M8-T3), D-43:**
- **The headers** are one list, `packages/domain/src/security/headers.ts`: HSTS (a year), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy` turning off 21 features the app doesn't use, and the CSP (`default-src 'self'`, scripts only from the site's files, `style-src 'self' 'unsafe-inline'` for Radix's scroll lock, `img-src`/`worker-src` with `data:`/`blob:` as planned, `object-src 'none'`, `base-uri`, `form-action` and `frame-ancestors`).
  - **Caddy:** `ops/caddy/security-headers.caddy`, generated by `pnpm headers:caddy` and checked by a unit test, is imported by the preview's Caddyfile (and T4's). It sets them as each request comes in, since Caddy writes error responses (the preview's 401, a 404) without the deferred ones.
  - **The API** sends the common ones only when no proxy is in front (no `X-Forwarded-For`), so nothing is doubled behind Caddy, and always its own policy (`default-src 'none'`), enforced alongside the site's. The API docs page keeps Swagger UI's policy, adjusted.
  - **`vite preview`** sends them, so every e2e test runs the production build under the production policy.
- **The web app needed one change for the CSP:** Zod 4 tries `new Function` once, which the policy reports. The build points `zod` at `src/zod.ts`, which turns that off first.
- **Rate limits** (`@fastify/rate-limit` 11.2.2, `http/rate-limits.ts`): 600 a minute for routes without a tier, shared; media 3,000 a minute; signing in and password changes 10 a minute per address; account and share links 20 a minute per address; adding members 60 an hour; uploads and imports 120 an hour. They count per token, account or address (IPv6 by /64), unknown routes included, and answer 429 with `Retry-After`. `GE_RATE_LIMITS=off` for the e2e tests and `pnpm perf`.
- **Uploads:** the 25 MB and 200 MB limits stand. Requests now hold at most four short fields, and nothing after the first file is read. sharp refuses images over 16,384 × 8,192 pixels from their header (a 74-byte PNG claiming 30,000 × 30,000 gets a 415). `/media/*` is sent as `image/webp`, `Content-Disposition: inline`, `nosniff`.
- **The XSS corpus** (`@ge/domain/testing`, now with Markdown and plain-text payloads) is planted through the API by `e2e/xss.spec.ts`. That test opens the universe list, each object's details with spoilers revealed, the outliner, search and History. It checks that no dialog opens, that no handler attribute, script URL or inline script reaches the page, and that the CSP reports nothing.
- **Every e2e test fails on a CSP violation,** through `e2e/test.ts` (a lint rule makes specs import it), so the golden path's "Done when" item holds for the whole suite.
- **CI:** `pnpm audit --prod --audit-level high` in `ci.yml`, and `secrets.yml`. gitleaks 8.30.1, checksum-checked, scans each push's commits; a run by hand and a weekly one scan the whole history.
- **securityheaders.com: A+** (2026-11-14, run by the owner with results hidden), for the preview. It can only see the 401 asking for the password, which carries the same headers as the app's pages; its two warnings say just that (not HTML, an error status). It doesn't flag `'unsafe-inline'` in `style-src`. M8-T5 can scan the production site the same way.

### M8-T4 Production build and containers

- Multi-stage Dockerfiles:
  - `api`: Node LTS slim, running as a non-root user with a read-only filesystem except the media volume. The API runs TypeScript through Node's type stripping, which refuses files inside `node_modules`, so copy the workspace as is or bundle the API (D-21);
  - `web`: builds static files into a Caddy image or a shared volume;
  - `migrate`: a one-off container running `db:migrate`;
  - `backup`: see M8-T7.
- `docker/compose.prod.yml` (architecture §14):
  - `caddy`, `api`, `mcp` (remote MCP, `pnpm mcp:http`, M8-T2), `postgres:18` with the `pgdata` volume, `migrate` with `depends_on`, and `backup`;
  - the `media` volume;
  - Postgres reachable only on the internal network;
  - healthchecks and `restart: unless-stopped`.
- The `Caddyfile`: the domain, automatic HTTPS, `import` of the security headers (`ops/caddy/security-headers.caddy`, M8-T3), the routes in architecture §14 (`/mcp` to the `mcp` service, which listens on the internal network with `GE_MCP_HOST=0.0.0.0` and so needs a token for every request), compression, long cache headers for hashed assets and no-cache for `index.html`. `/media/*` is served from the volume after `forward_auth` to the API's `/api/v1/media-access` (T11), copying its `Cache-Control`, with `Content-Disposition: inline` (as the API's own `/media/*` sends, M8-T3). The API runs with `GE_TRUST_PROXY` set to Caddy's network, so the rate limits count visitors' addresses.

**Done when:**
- [x] `docker compose -f docker/compose.prod.yml up` on the owner's Mac (with a `localhost` Caddy site) serves the production build, and the golden-path e2e test passes against it.

**As built (M8-T4), D-44:**
- **Images:** `docker/api.Dockerfile` (`node:26.12.0-trixie-slim`, pnpm 12.16.1) keeps the workspace's layout and installs only `@ge/api` and `@ge/mcp` with their production dependencies; the API, the MCP server and `migrate` run from it. `docker/web.Dockerfile` builds the web app and puts it in `caddy:2.11.9-alpine` with `ops/caddy/Caddyfile` and the security headers. The `VITE_*` build settings are build arguments.
- **`docker/compose.prod.yml`** (project `galaxy-explorer-prod`, apart from the development databases): `postgres:18.6` on the internal network only, `migrate` before the `api`, `mcp` after it, and `caddy` once both are healthy. Healthchecks and `restart: unless-stopped` throughout. The API and MCP server run as `node`, read-only (the API's media volume and `/tmp` aside). `GE_TRUST_PROXY=uniquelocal`. Settings come from an env file (`docker/production.env.example`). The `backup` service joins in T7.
- **`ops/caddy/Caddyfile`:** the site from `GE_SITE_ADDRESS`, with `default_sni` for clients that connect by IP address. It imports the security headers. `/api` goes to the API, `/mcp` to the MCP server. `/media` is served from the volume after `forward_auth`, with the API's `Cache-Control` and `X-Robots-Tag` and `Content-Disposition: inline`. Compression, and immutable caching for `/assets`, `no-cache` for the rest.
- **"A `localhost` site" is `127.0.0.1`:** browsers ignore HSTS for IP addresses, so trying the stack can't send the owner's `localhost` dev server to HTTPS for a year. Caddy's own authority signs its certificate.
- **The API took one fix:** a blank `GE_WIKI_USER_AGENT`, as compose passes an unset one, now means the default.
- **Tests:** `pnpm test:stack` (`apps/web/playwright.stack.config.js`) makes an account through an invite link from the API's container, signs in, and runs the golden path and `e2e/stack.spec.ts` (an image in a private universe reaches its owner through Caddy with its headers, and a stranger gets 404), in Chromium and WebKit under the site's own CSP: 4 passed on the owner's Mac. By hand, with curl: the HTTP redirect, the headers on pages, assets and API responses, MCP's 401 without a token; in the containers, the users and read-only filesystems, and no published Postgres port.
- **[docs/ops/production.md](../../ops/production.md)** covers the settings, trying the stack locally, the first admin (`… exec api node apps/api/src/auth/cli.ts create-user --admin`), testing it and day-to-day commands.

### M8-T5 Droplet provisioning

- `docs/ops/droplet.md`, a runbook whose steps are scripted where practical (`scripts/ops/provision.sh`, safe to run twice):
  1. Create an Ubuntu LTS droplet with 2 vCPU and 4 GB as a starting point, and add the SSH key.
  2. Create a non-root `deploy` user; turn off password and root SSH login.
  3. `ufw`: allow 22, 80 and 443 only. `fail2ban`. Unattended security upgrades.
  4. Install Docker Engine and the Compose plugin.
  5. Point the domain's DNS A/AAAA records at the droplet.
  6. Create `/srv/galaxy-explorer` with `.env.production`, file mode 600, documented in the runbook and never committed.
- Monitoring: DigitalOcean's monitoring agent, plus an uptime check on `/api/health` with email alerts.

**Done when:**
- [x] The runbook has been followed once from scratch, and corrected wherever reality differed.

**As built (M8-T5), D-45:**
- **`scripts/ops/provision.sh`** (safe to run again; tested twice in an Ubuntu 24.04 container, then twice on the droplet):
  - the `deploy` login with root's SSH key, and SSH with keys only and no root login, in `sshd_config.d/01-…`, named to come before cloud-init's `50-…`. It checks `sshd -T` afterwards;
  - `ufw` (22, 80, 443/tcp, 443/udp), `fail2ban`, automatic security updates;
  - Docker and Compose with log rotation (5 × 10 MB per container), and 2 GB of swap;
  - DigitalOcean's monitoring agent (installed if the droplet was made without it);
  - `/srv/galaxy-explorer` (750) with `.env.production` (600), both `deploy`'s;
  - it waits for cloud-init and apt's lock on a new droplet.
- **[docs/ops/droplet.md](../../ops/droplet.md)**, followed on 2026-11-15: `galaxy-explorer-prod` in NYC3 (2 vCPU, 4 GB, Ubuntu 24.04), 159.203.101.110. The secrets were made on the droplet. IPv6 wasn't ticked at creation: the owner turned it on afterwards (2604:a880:800:14:0:3:dc59:0), and a netplan file of its own added it in Ubuntu (the runbook's step 1). It works from the droplet out; inbound is checked at go-live, from somewhere with IPv6.
- **The site's name is `galaxyexplorer.perturbatory.com`,** the preview's (D-45). DNS moves to the droplet at go-live, with the uptime check on `/api/health`, in M8-T6; the preview goes dark then.

### M8-T6 Deploy pipeline

- A GitHub Actions workflow `deploy.yml`, run manually or on a version tag:
  1. Build and push the images to GHCR, tagged with the git SHA.
  2. SSH to the droplet with a deploy key.
  3. `docker compose pull`.
  4. Run `migrate`.
  5. `up -d`.
  6. Check `/api/health`, and roll back to the previous tag if it fails.
- `docs/ops/deploy.md` covers how to deploy, roll back and read the logs.

**Done when:**
- [x] A tagged release deploys without manual steps.
- [x] A deliberately broken release (health check failing) rolls back on its own.

**As built (M8-T6), D-46:**
- **`.github/workflows/deploy.yml`** (on a `v*` tag, or by hand): builds both images, pushes them to GHCR as `ghcr.io/vault21inc/galaxy-explorer-{api,web}:<commit>` (and `:<version>`), copies the release's compose file and `scripts/ops/deploy-release.sh` to `/srv/galaxy-explorer/releases/<commit>/`, logs the droplet in to GHCR with the run's own token (out again at the end), and runs the script. `migrate` runs as part of `up`, before the API.
- **`scripts/ops/deploy-release.sh`:** pulls (unless the images are there already), `up --wait` (every container healthy), then `/api/health` through Caddy at the site's address once DNS points at the droplet (else from Caddy's container). Healthy: recorded in `current`, the last 5 releases kept. Not: the previous release is started again and the run fails. An earlier release's script, run by hand, rolls back to it.
- **Access:** the `production` environment holds the droplet's address, `deploy`, an SSH key marked `restrict` in `authorized_keys`, and the droplet's pinned host keys.
- **The runs, 2026-11-15:**
  - by hand on `main` (b078548): live on the new droplet;
  - **go-live** (D-45): the owner moved `galaxyexplorer.perturbatory.com` (A and AAAA) to it, Caddy got a Let's Encrypt certificate, and the owner made the first admin with `create-user --admin`;
  - **a broken release** (5325833, on the throwaway branch `deploy-test/broken-health`, its health route always 503): its API was unhealthy, b078548 came back healthy within the run, and the run failed. The branch and the release were removed after;
  - **`v0.2.0`** (48f4fa5): pushing the tag deployed it, with no manual step.
- **[docs/ops/deploy.md](../../ops/deploy.md)** covers releasing, rolling back, logs and access.

### M8-T7 Backups and restore

- The `backup` container runs nightly:
  - `pg_dump --format=custom`;
  - a tar of the media volume;
  - both uploaded to DigitalOcean Spaces with a dated prefix, keeping 30 days, using a scoped key stored in `.env.production`.
- `docs/ops/restore.md` gives the restore steps, and `scripts/ops/restore-drill.sh` restores the latest backup into a scratch database and checks row counts against the backup's manifest.

**Done when:**
- [ ] The restore drill has run successfully once against a real backup, and the date is recorded in `docs/ops/restore.md`.

### M8-T8 Moving local content to production

- Export each local universe (M7-T4), then import it on production in **create** mode with a dry run first, then for real, signed in as the admin, who becomes each universe's owner. Asset files travel inside the zip.
- Each imported universe starts private. The owner looks it over, then makes it public.
- Check object counts, spot-check pins and images, and run the golden path read-only against production.

**Done when:**
- [x] Production holds the owner's content, and a sampled set of 20 entities matches the local copy.

**How it went (2026-11-15):**
- **The owner's content was on the preview, not this Mac.** Eisenhorn was built on the private preview (D-31), and the local copy is an older one, with 9 entries to the preview's 43. The Mac's other universes are left over from tests and screenshots. So the source was the preview's export (`.data/restore/`, gitignored), imported into production that morning, signed in as the owner. The demo universe was seeded on production, rather than carried over.
- **The import found a bug,** fixed in 5b41915 and released in v0.2.1: an export with wiki citations couldn't be imported, because their dates were in Postgres's text form, not ISO 8601.
- **The check** compared production's export of Eisenhorn with the preview's, entry by entry, rather than 20 sampled. All 43 entries (objects, groups and events), their relations, the universe's settings rows and characters, and the 27 image files (by SHA-256) match. There are two differences. Two events have a category that the owner set on production that afternoon, as History shows. Citation dates are the same instants, written as `+00:00` in the preview's file and `Z` on production.
- **Read anonymously,** through the public API, Eisenhorn's galaxy view has its 9 systems and its group. The golden path writes and needs the test hooks, which production's build leaves out. Instead, the owner's M7 demo, run on production the same day, went through every view and editing tool there.

### M8-T9 Public polish

- **Attributions page** (`/about/attributions`):
  - every citation (CC BY-SA text, M7-T3);
  - image credits;
  - icon-set attribution if game-icons.net was chosen;
  - a fan-site disclaimer saying it isn't affiliated with or endorsed by any rights holder, such as Games Workshop.
- **Privacy:** no third-party trackers. A short privacy note: only the browser's own storage is used, for preferences.
- **Link previews:** page titles and Open Graph tags per galaxy, system and object URL, for **public** universes only. The API renders minimal HTML meta for crawlers at `/u/…`, with spoilers excluded; full server rendering stays out of scope. A link-only or private universe gets no preview and `noindex`.
- **Privacy note, for accounts:** what an account stores (a username, a password hash, its two-factor secret, its sessions), who can see a private universe (its owner and members; whoever runs the server can read its database), and how to have an account removed.
- Friendly 404 and 500 pages. A link to a draft, or to a universe the visitor can't read, gets the same "not found" page, with "Sign in" for the signed-out.

**Done when:**
- [ ] Sharing a planet URL in a chat app shows its name and image with no spoilers. (The e2e tests fetch a planet's address as Slack's fetcher does and get its name, summary and image without its spoiler. The check in a real chat app waits for the release.)
- [x] The attributions page lists every citation.

**As built (2026-11-15, D-48):**
- **Link previews.** `@ge/domain/link-preview` lists the fetchers by User-Agent (Slack, Discord, X, Facebook and Apple's Messages, LinkedIn, Telegram, WhatsApp and Signal, Reddit, Mastodon, Bluesky, Pinterest, VK, Embedly, Iframely and the main search engines) and the addresses with previews (`/u/{slug}`, `/u/{slug}/{map}`, `…/view/{id}`). `pnpm headers:caddy` writes them into `ops/caddy/link-previews.caddy`, which the Caddyfile imports, and `vite preview` applies them too. The API's `GET /api/v1/link-preview?path=…&select=…` writes Open Graph and Twitter tags: the object's name, its summary or description without spoilers, and its cover or first gallery image, else the map's or the universe's card. It reads as an anonymous visitor, so a universe that isn't public gets the site's card and `noindex`. Browser tabs get the same titles (`pageTitle`).
- **The attributions page** (`/about/attributions`, `GET /api/v1/attributions`) has the fan-site disclaimer, the icon sets' credits and, per universe the reader can open, each source page once (title, site, licence as stated, last read) and each image credit once. Drafts are left out; a source only spoilers cite is hidden like a spoiler.
- **The privacy page** (`/about/privacy`) lists what the browser keeps, from the stores' own key list (`apps/web/src/state/storage-keys.ts`), the two cookies, the server's logs and, with accounts, what an account stores, who sees a private universe and how to have an account removed (ask an admin). The home page links both pages, and the account page links the privacy note.
- **Errors.** "Not found" was already one page for a missing or unreadable universe or map, with Sign in for the signed-out (M8-T11), and a missing or draft object has its own note in the map. A page that fails as it draws, or whose code is gone after a release, now gets "Something went wrong" with Retry and a link home, under the top bar, instead of React Router's developer page.
- **Tests:** `apps/api/test/site.int.test.ts` (6: cards for an object, a selection, a map and a universe; drafts, spoilers and bad ids; private, link-only and missing; attributions, once per page and credit, drafts left out, spoilers marked, only readable universes), `link-preview.test.ts` (the committed snippet, escaping) in the API and domain, and `e2e/about.spec.ts` (5: a Slack fetch of a planet against a browser's, both pages with axe, the error page when a page's code fails to load, tab titles).

### M8-T10 Guided tours

**Where:** `apps/web/src/help/` (the tour registry, the step popover, the highlight), `src/app/top-bar.tsx`, a `data-tour` attribute on each control a step points at, and `apps/api/src/seeds/demo.ts`.

The details are in D-30 and ux.md §12. This is M8's last task, because the tours describe the finished app.

- **The tour registry** (`src/help/tours.ts`) holds the `reader` and `editor` tours, each an ordered list of steps. A step has:
  - an id, a title and a sentence or two, in the app's own words ("event", never "scene");
  - a target: a control's `data-tour` name, an object found through the scene index (such as "an explorable system on screen"), or nothing, for a step about the whole view;
  - what completes it: the Next button, or a change in the app, such as the label mode, the selection, the camera or the view level;
  - what it needs, if anything: a feature, an account, edit mode. A step whose need isn't met is skipped.
- **The reader tour** runs on the current map and writes nothing:
  1. moving around: drag, right-drag or ⌘/Ctrl-drag, and the wheel;
  2. selecting a system, and its panel;
  3. labels (L), and holding Space;
  4. the spoiler toggle;
  5. the List;
  6. groups and the Layers popover;
  7. entering a system, then a planet (double-click, Enter or zooming in), and going back (Esc or the breadcrumbs);
  8. the events list;
  9. search (⌘/Ctrl + K);
  10. `?` for every shortcut.
- **The editor tour** is for anyone signed in:
  - It starts by creating the **practice universe**. `POST /api/v1/practice-universe`, for accounts, runs the demo seed (`seedDemo`, now taking a slug, a name and the actor) into a new universe named "Practice", as one batch. It is private and belongs to the account (T11), so nobody else sees it, and it counts toward the account's quota until deleted.
  - Its steps: edit mode and the toolbar; adding an object (N) and naming it; moving it, changing its height and snapping; its form (color, size); box-select and grouping (⌘/Ctrl + G); undo and History; the settings page; map settings and the underlay; a region and a route; inside a system, adding a planet; on a globe, a place and an event; deleting, with the impact shown.
  - At the end it offers "Delete the practice universe", the default, or "Keep it".
- **Showing a step:** a non-modal popover beside the target, labelled "Tour, step 3 of 10", with Back, Next and End. Focus moves to it, and Esc ends the tour. The target gets a highlight ring drawn in the DOM over the page; for an object, at its screen position from the scene index. The canvas draws nothing extra, and with `prefers-reduced-motion` nothing animates (ux.md §10).
- **Offering:** "New here? Take the tour" on a reader's first visit, and "Take the editor tour" on an account's first time in edit mode. Both are dismissible and remembered per browser (`ge.tours` in local storage). The Help button becomes a menu: Keyboard shortcuts (M4-T9), Take the tour, Editor tour (signed in) and About (the attributions page, M8-T9).
- **AGENTS.md:** the definition of done gains "a user-facing feature adds or updates its tour step".

**Done when:**
- [ ] Unit tests: every step names a target kind, a completion and a need the registry knows, and steps whose need isn't met are skipped.
- [ ] E2E, in both browsers: each tour runs from start to end, and every step finds its target on screen. Esc ends a tour, and the Help menu starts it again.
- [ ] The editor tour creates the practice universe, writes only inside it, and deletes it at the end. The account's other universes and their history are unchanged, and neither an anonymous reader nor another account ever sees "Practice".
- [ ] The first-visit prompt shows once, and dismissing it survives a reload.
- [ ] axe finds no violations with a step open, and idle stays at 0 frames while a step waits.

---

## Milestone acceptance

- [ ] All tasks are checked off; the demo works on the real domain, with two real accounts.
- [ ] The performance gate is re-run against production over broadband: first frame within 4 s, and the interaction budgets hold.
- [ ] The decision log is updated with anything that changed (domain, droplet size, backup retention).
