# The private preview

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

It's safe to run again. It ends by printing a **deploy key**. From now on log in as `deploy`:

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
- installs the Caddyfile and reloads Caddy.

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

Run it again whenever you want the preview to catch up with your local work. Anything edited on the server since is replaced, but stays in that backup.

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
sudo docker compose --env-file /srv/galaxy-explorer/preview.env -f /srv/galaxy-explorer/app/ops/preview/compose.yml exec -T db pg_restore -U ge -d ge --clean --if-exists --no-owner --single-transaction < /srv/galaxy-explorer/backups/ge-<date>.dump
```

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

The server setup itself (steps 1–6) gets corrected here the first time it's followed for real.
