# M8: Going public

**Goal:** a secure, backed-up public site on one DigitalOcean droplet, where:
- anonymous visitors explore published content;
- only the owner can edit, with a password and two-factor codes;
- LLM agents use revocable tokens;
- the content built locally is carried over.

**Depends on:** M6, plus M7-T4 for the content migration and M7-T7 for remote MCP.
**Read first:** [architecture.md §7, §14](../architecture.md), [data-model.md §3.8, §8](../data-model.md), [decisions.md T6, X5, D-15, D-19](../decisions.md).
**Demo at the end:**
1. `https://<domain>` serves the galaxy with an A+ TLS rating.
2. Anonymous visitors see published content only.
3. The owner logs in with password and TOTP and edits.
4. An agent with a write token creates an object over remote MCP; revoking the token stops it.
5. Last night's backup restores into a scratch database.

**Before starting:** the owner picks a domain name and creates a DigitalOcean account and a Spaces bucket. Budget is not a constraint (X5).

---

### M8-T1 Owner login

- Add the `users` and `sessions` tables (data-model §3.8) in a migration. They are **not** audited.
- `pnpm admin:create-user`, a command-line tool that prompts for a username and password and then sets up TOTP: it prints the otpauth URI and a QR code in the terminal, and requires one valid code before saving.
- Passwords are hashed with argon2id (`@node-rs/argon2`). TOTP uses `otplib`, with a ±1 step window. The TOTP secret is encrypted with a key derived from `GE_SESSION_SECRET`.
- `POST /api/v1/auth/login` takes `{ username, password, totp }`. On success it sets a session cookie:
  - `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`;
  - valid for 30 days, with sliding renewal;
  - stored only as a hash.
- `POST /auth/logout` and `GET /auth/me`.
- Login is rate-limited (5 attempts per 15 minutes per IP and per username) and fails with a generic message.
- **Mutations check `Origin`** against `GE_PUBLIC_URL`, protecting against CSRF together with `SameSite`.
- `GE_AUTH_MODE=required`:
  - anonymous visitors can read published content only;
  - mutations need a session or a write token;
  - `/api/health` reports `authMode`, and the web app shows the edit toggle only to signed-in owners.
- A login page at `/login`, built with shadcn components.

**Done when:**
- [ ] Integration tests cover: a wrong password, a wrong or old TOTP code, a successful login, an expired session, logout, a cross-origin mutation rejected, and anonymous visitors never seeing drafts.
- [ ] E2E: log in and edit; log out and the edit toggle is gone.

### M8-T2 API tokens and remote MCP

- Add the `api_tokens` table (data-model §3.8).
- Settings page, "API tokens": create one (name, scopes `read`/`write`/`admin`, optional universe), show it **once**, list tokens with last use, and revoke.
- `Authorization: Bearer ge_…` authenticates; the API stores only the token's hash. Revoked or out-of-scope tokens get 401 or 403. The token's name becomes the batch's `actor_label`.
- MCP: a Streamable HTTP transport mounted at `/mcp` on the API host, or as its own service behind Caddy, accepting the same bearer tokens. The stdio mode keeps working with `GE_API_TOKEN`.

**Done when:**
- [ ] Integration tests: a read token can't write; a revoked token gets 401; a universe-scoped token can't touch another universe.
- [ ] A remote MCP smoke test creates an object, and the History panel shows it under the token's name.

### M8-T3 Security hardening

- Headers, set in Caddy, with the API as a fallback:
  - a strict `Content-Security-Policy` (`default-src 'self'`; `img-src 'self' data: blob:`; `worker-src 'self' blob:`; `connect-src 'self'`; `style-src 'self' 'unsafe-inline'` only if Tailwind or Radix need it; no inline scripts);
  - `Strict-Transport-Security`;
  - `X-Content-Type-Options`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - a `Permissions-Policy` that turns off what isn't used.
- `@fastify/rate-limit` on all routes, with stricter limits for auth and uploads.
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
- The `Caddyfile`: the domain, automatic HTTPS, the routes in architecture §14, compression, long cache headers for hashed assets and no-cache for `index.html`.

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

- Export each local universe (M7-T4), then import it on production in **create** mode with a dry run first, then for real. Asset files travel inside the zip.
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
- **Sharing:** page titles and Open Graph tags per galaxy, system and object URL. The API renders minimal HTML meta for crawlers at `/u/…`, with spoilers excluded; full server rendering stays out of scope.
- Friendly 404 and 500 pages, and a "This content is unpublished" page for links to drafts.

**Done when:**
- [ ] Sharing a planet URL in a chat app shows its name and image with no spoilers.
- [ ] The attributions page lists every citation.

---

## Milestone acceptance

- [ ] All tasks are checked off; the demo works on the real domain.
- [ ] The performance gate is re-run against production over broadband: first frame within 4 s, and the interaction budgets hold.
- [ ] The decision log is updated with anything that changed (domain, droplet size, backup retention).
