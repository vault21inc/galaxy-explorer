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

**Order:** T1, T11, T12, T13, then T2 to T10. T11 to T13 were added by D-34 after T2 to T10 were numbered; the numbers stay, so other documents' references still hold.

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
- [ ] Integration tests cover: a wrong password; a wrong or old TOTP code; a successful login; an expired session; logout; a cross-origin mutation rejected; an invite accepted once and refused the second time; an expired link; a taken username; a reset that replaces the password and TOTP and ends the account's sessions; a disabled account's session and login refused; the rate limit.
- [ ] E2E: the admin logs in and edits; logged out, the edit toggle is gone. An invite link (made with `pnpm admin:invite` in the test's setup) leads through username, password and TOTP to a signed-in account.

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
- **Media quota:** an upload that would take the owner past `media_quota_bytes` is refused with a 413 that says how much is used.
- **The web app:** the edit toggle follows the universe's `access` (from `edit` up) instead of `/api/health`'s `canEdit`; a universe the requester can't read shows the ordinary "not found" page, with "Sign in" if they're signed out; the home page lists Your universes, Shared with you and the public ones (ux.md §13).
- **AGENTS.md:** the Security rules gain "every service call that touches a universe asks `universeAccess`; a universe the requester can't read is a 404".

**Done when:**
- [ ] The access contract suite walks the OpenAPI document, with no route listed by hand: for every route with a universe, map, entity, asset, batch or settings record in its path, on a private universe a stranger and an anonymous visitor get 404, a viewer reads and gets 403 on every write, an editor writes but gets 403 on address, visibility, members, transfer and delete, and the owner may do all of it. A route the suite can't classify fails it.
- [ ] Integration tests: drafts are hidden from viewers and shown to editors; `GET /universes` lists exactly what each kind of requester can read; a batch touching two universes, one of them not editable, changes nothing; a private universe's media file is 404 for a stranger and served to a viewer; an upload past the quota is refused.
- [ ] E2E: an account's new universe is private, and a signed-out browser gets "not found" at its address; made public, it appears on the home page for everyone.
- [ ] With `GE_AUTH_MODE=none`, every existing test passes unchanged.

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
- [ ] Integration tests: adding, changing and removing members; a member leaving; only the owner managing; an unknown username; the unlock cookie reading a link-only universe and failing after the key is replaced; transfer with and without room in the quota; each change's `access_events` row.
- [ ] E2E, with separate browser contexts: the owner adds a viewer and an editor; the viewer reads but has no edit toggle and sees no drafts; the editor edits, and History shows their name; a signed-out browser opens the share link, keeps the key while entering a system, and gets "not found" once the link is replaced.

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
- [ ] Integration tests: a member and a token get 404 on every admin route; inviting, resetting, disabling and enabling, the role change and the last-admin rule; deleting an account that owns universes is refused; an admin reading another account's private universe gets 404, before and after listing it; transfer and takedown; each action's `access_events` row.
- [ ] E2E: the admin invites an account from the Accounts screen; the invitee signs up through the link and creates a private universe; the admin sees it in Universes but gets "not found" at its address; the admin disables the account, and its browser is signed out at its next request.
- [ ] axe finds no violations on the account page, the link pages and the admin screens.

### M8-T2 API tokens and remote MCP

- Add the `api_tokens` table (data-model §3.8). A token belongs to the account that made it (D-34).
- The account page's "API tokens" (T13): create one (name, `read` or `write`, optionally one universe), show it **once**, list tokens with last use, and revoke.
- `Authorization: Bearer ge_…` authenticates as the token's account, narrowed by its scopes and universe: each request goes through `universeAccess` (T11) as that account, so a token can never do more than its account can at that moment. Revoked tokens, and tokens of a disabled account, get 401; out-of-scope requests get 403. There is no admin scope: the account, sharing and admin routes refuse tokens.
- The token's name and its account's become the batch's `actor_label` ("token: claude-code, for aemos").
- MCP: a Streamable HTTP transport mounted at `/mcp` on the API host, or as its own service behind Caddy, accepting the same bearer tokens. The stdio mode keeps working with `GE_API_TOKEN`.

**Done when:**
- [ ] Integration tests: a read token can't write; a revoked token gets 401; a universe-scoped token can't touch another universe; a token loses a universe when its account loses it; a token is refused on the account, sharing and admin routes.
- [ ] A remote MCP smoke test creates an object, and the History panel shows it under the token's name.

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
- [ ] securityheaders.com rates the site A or better.
- [ ] The CSP raises no violations during the golden-path e2e test against a production build.
- [ ] The new CI checks run on every push.

### M8-T4 Production build and containers

- Multi-stage Dockerfiles:
  - `api`: Node LTS slim, running as a non-root user with a read-only filesystem except the media volume. The API runs TypeScript through Node's type stripping, which refuses files inside `node_modules`, so copy the workspace as is or bundle the API (D-21);
  - `web`: builds static files into a Caddy image or a shared volume;
  - `migrate`: a one-off container running `db:migrate`;
  - `backup`: see M8-T7.
- `docker/compose.prod.yml` (architecture §14):
  - `caddy`, `api`, `postgres:18` with the `pgdata` volume, `migrate` with `depends_on`, and `backup`;
  - the `media` volume;
  - Postgres reachable only on the internal network;
  - healthchecks and `restart: unless-stopped`.
- The `Caddyfile`: the domain, automatic HTTPS, the routes in architecture §14, compression, long cache headers for hashed assets and no-cache for `index.html`. `/media/*` is served from the volume after `forward_auth` to the API's `/api/v1/media-access` (T11), copying its `Cache-Control`.

**Done when:**
- [ ] `docker compose -f docker/compose.prod.yml up` on the owner's Mac (with a `localhost` Caddy site) serves the production build, and the golden-path e2e test passes against it.

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
- [ ] The runbook has been followed once from scratch, and corrected wherever reality differed.

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
- [ ] A tagged release deploys without manual steps.
- [ ] A deliberately broken release (health check failing) rolls back on its own.

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
- [ ] Production holds the owner's content, and a sampled set of 20 entities matches the local copy.

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
- [ ] Sharing a planet URL in a chat app shows its name and image with no spoilers.
- [ ] The attributions page lists every citation.

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
