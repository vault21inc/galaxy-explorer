# The private preview

**Retired on 2026-11-15** (D-45, D-46): its name, `galaxyexplorer.perturbatory.com`, now serves the production site ([production.md](production.md), [deploy.md](deploy.md)). Its droplet (201.79.43.42) no longer answers at that name and can be deleted. The rest of this page is kept as a record.

A password-protected copy of the app on one server, so invited people can explore your galaxy and give feedback before M8 builds the real public site. You edit; testers read.

**What it is:**
- one Ubuntu server running Caddy (HTTPS and sign-in), the API under systemd, and Postgres in Docker;
- every visitor signs in with a browser password prompt: you with your own user, testers with a shared one;
- Caddy tells the API which requests are yours (`X-GE-Role: editor`), and the API refuses everyone else's writes and draft reads (`GE_PREVIEW_ROLES=on`, `apps/api/src/http/preview-roles.ts`);
- nightly backups on the server itself.

**What it isn't:**
- **The production setup.** That's M8: real logins with two-factor codes, API tokens, security headers and rate limits, containers, a deploy pipeline with rollback, and off-site backups with restore drills.
- **A site to post a public link to.** Anyone with the tester password can read everything published, so give it only to people you'd trust with it.

The files are `ops/preview/` (Caddyfile, Postgres, systemd unit, settings template) and `scripts/ops/preview-*.sh`.

---

## 1. Create the server (you, about 10 minutes)

1. Create a droplet (DigitalOcean) or Linode:
   - Ubuntu 24.04 LTS;
   - 2 vCPU and 4 GB, about $24 a month;
   - the region nearest your testers;
   - your SSH key added (the provider's "SSH keys" option).
2. Note its IPv4 address, such as `203.0.113.5`.
3. Pick its name:
   - **with a domain:** add a DNS `A` record such as `galaxy.example.com` → the address;
   - **without one:** use `203-0-113-5.sslip.io`. sslip.io answers with the address written in the name, and Caddy gets a real certificate for it.

## 2. Set it up (one command)

From your Mac:

```bash
scp scripts/ops/preview-provision.sh root@203.0.113.5:
```

```bash
ssh root@203.0.113.5 'ADMIN_USER=deploy bash preview-provision.sh'
```

This:
- creates your admin login, `deploy`, with your SSH key;
- turns off password and root logins;
- opens only SSH, HTTP and HTTPS;
- turns on automatic security updates and fail2ban;
- installs Docker, Node 26, pnpm and Caddy;
- creates the `ge` user that runs the app;
- schedules the nightly backup.

It's safe to run again. Its first run turns off root's SSH login, so run it again as `deploy`, with `sudo ADMIN_USER=deploy bash preview-provision.sh`. It ends by printing a **deploy key**. From now on log in as `deploy`:

```bash
ssh deploy@203.0.113.5
```

## 3. Let the server read the repository

The repository is private:
1. On GitHub: **vault21inc/galaxy-explorer → Settings → Deploy keys → Add deploy key**.
2. Paste the key the script printed. Leave "Allow write access" off.
3. On the server, clone it as `ge`:

```bash
sudo -u ge git clone git@github.com:vault21inc/galaxy-explorer.git /srv/galaxy-explorer/app
```

## 4. Settings and passwords

On the server:

1. The app's settings, with a long random database password in both places it appears:

   ```bash
   sudo install -m 600 -o ge -g ge /srv/galaxy-explorer/app/ops/preview/preview.env.example /srv/galaxy-explorer/preview.env
   ```

   ```bash
   sudo nano /srv/galaxy-explorer/preview.env
   ```

   `openssl rand -hex 24` makes a good password.

   Its `VITE_` lines are the web app's build settings: the deploy writes them to `apps/web/.env.production.local` before building. The preview sets the first-visit defaults (D-38) so testers start with every label shown and spoilers shown: `VITE_DEFAULT_LABEL_MODE=all` and `VITE_DEFAULT_SPOILERS=shown`. A tester's own choice (L, Shift + S, the toggle) is remembered in their browser and wins. Remove the lines for the app's usual defaults, then deploy again.

2. Choose two passwords: yours and the testers'. Hash each (it asks you to type it):

   ```bash
   caddy hash-password
   ```

3. Caddy's settings:

   ```bash
   sudo nano /etc/caddy/preview.env
   ```

   ```
   GE_PREVIEW_HOST=203-0-113-5.sslip.io
   GE_EDITOR_USER=vincent
   GE_EDITOR_HASH=$2a$14$…your hash…
   GE_TESTER_USER=guest
   GE_TESTER_HASH=$2a$14$…the testers' hash…
   GE_WEB_ROOT=/srv/galaxy-explorer/app/apps/web/dist
   ```

   The file is readable only by root and Caddy.

## 5. Deploy

```bash
bash /srv/galaxy-explorer/app/scripts/ops/preview-deploy.sh
```

This:
- checks out `origin/main`;
- installs and builds;
- starts Postgres and migrates the database;
- starts the API and waits for `/api/health`;
- installs the Caddyfile, with the security headers it imports (`ops/caddy/security-headers.caddy`, M8-T3), and reloads Caddy.

Open `https://203-0-113-5.sslip.io`, sign in, and you should see an empty app. The first visit can take a few seconds while Caddy gets its certificate.

## 6. Copy your content up

On your Mac, from the repository, with the same version deployed:

```bash
bash scripts/ops/preview-push-content.sh deploy@203.0.113.5
```

It:
- dumps your local database and `.data/media` images;
- uploads them;
- backs up what's on the server;
- **replaces** the server's content with yours, then restarts the API.

Run it again whenever you want the preview to catch up with your local work. Anything edited on the server since is replaced, but stays in that backup. Afterwards the copy is migrated to the server's version of the app, in case your local database was a migration behind.

## Demo content

Testers can explore the demo universe (`apps/api/src/seeds/demo.ts`) instead of your own work. This resets the preview to a fresh database with only the demo seeded:

```bash
ssh deploy@203.0.113.5 sudo bash /srv/galaxy-explorer/app/scripts/ops/preview-seed.sh
```

The demo is Example Universe: two maps, systems with stars, planets, moons, a belt and a station, regions, groups and a route, plus spoilers and a draft. What was there before is backed up first; to bring your own work back, copy it up again (step 6). The demo's two images are placeholders without files, so they show as missing.

## Inviting testers

Send them:
- the address;
- the tester user name and password;
- what to look at: entering systems by zooming in or double-clicking, moving around with mouse or trackpad, labels, spoilers and the info panel.

Tell them what's known:
- the orbit view is a placeholder until M6;
- only Chrome and Safari are tested;
- the app reads only; the Edit button is yours alone.

Ask for feedback with their browser and computer, since smoothness depends on both.

To change the testers' password, hash a new one, put it in `/etc/caddy/preview.env`, and reload:

```bash
sudo systemctl reload caddy
```

## Updating

After pushing to `main`:

```bash
ssh deploy@203.0.113.5 bash /srv/galaxy-explorer/app/scripts/ops/preview-deploy.sh
```

Pass a commit or tag to deploy something else; `origin/main` is the default. Migrations run on every deploy. There's no automatic rollback: to go back, deploy the previous commit.

## Backups

Every night at 03:30 the server saves the database and images to `/srv/galaxy-explorer/backups`, keeping 14 days. To make one now:

```bash
sudo bash /srv/galaxy-explorer/app/scripts/ops/preview-backup.sh
```

These stay on the same server, so they protect against mistakes, not against losing the server. Turn on your provider's weekly server backups too, for about 20 % of the server's price.

To restore one, stop the API, restore the dump into Postgres, and start it again:

```bash
sudo systemctl stop galaxy-explorer-api
```

```bash
cd /srv/galaxy-explorer && alias pc='sudo docker compose --env-file preview.env -f app/ops/preview/compose.yml'
```

```bash
pc exec -T db sh -c 'dropdb -U ge --force ge && createdb -U ge ge' < /dev/null
```

```bash
pc exec -T db pg_restore -U ge -d ge --no-owner --exit-on-error < backups/ge-<date>.dump
```

A fresh database, then the dump: `pg_restore --clean` can't drop `celestial_objects`, whose foreign keys point at itself.

```bash
sudo systemctl start galaxy-explorer-api
```

## When something's wrong

| Symptom | Look at |
|---|---|
| The page doesn't load, or a certificate error | `sudo journalctl -u caddy -n 50`. Check that DNS points at the server and that ports 80 and 443 are open. |
| "Couldn't load…" in the app | `sudo journalctl -u galaxy-explorer-api -n 50`, and `curl -s http://127.0.0.1:3100/api/health` on the server |
| The database | `sudo docker compose --env-file /srv/galaxy-explorer/preview.env -f /srv/galaxy-explorer/app/ops/preview/compose.yml ps` |
| Disk space | `df -h`. Backups and Docker images are the usual growth. |

## How it was checked

On the owner's Mac, Caddy's Docker image ran this Caddyfile in front of an API in preview mode:
- a request without a password, or with a wrong one, got 401;
- the tester could load the app and read, but had no Edit button;
- the tester's writes and draft reads got 403, even with a forged `X-GE-Role: editor`;
- the editor's writes reached the API;
- built assets were cached for a year and pages not at all.

The runbook was first followed for real on 2026-11-11, for `galaxyexplorer.perturbatory.com`, on a DigitalOcean droplet (Ubuntu 24.04.5, 2 vCPU, 4 GB). What it corrected:
- **The setup script stopped near its end.** Ubuntu 24.04's `ssh-keyscan` has no `-q`. By then it had already turned off root login, so later runs are as `deploy`, with `sudo`.
- **Deploying before the sign-ins are set** now leaves Caddy alone and says so, instead of failing on a Caddyfile it can't load.
- **The content copy restored nothing.** Its server half came through ssh's input, and `docker compose exec` swallowed it. It now runs as a file on the server.
- **`pg_restore --clean` can't drop `celestial_objects`,** whose foreign keys point at itself. Restores now go into a fresh database.
- **macOS adds extended attributes** to the media archive, which Linux `tar` warns about. They're left out now.
