# The production stack

The public site runs as one Docker Compose stack on one machine (M8-T4, [architecture.md §14](../plan/architecture.md#14-production-topology-m8)). This page covers running it: on your own Mac to try it, and later on the droplet (M8-T5), deployed by the pipeline (M8-T6).

## What's in it

| Service | Image | Does |
|---|---|---|
| `caddy` | `docker/web.Dockerfile`: Caddy with the web app's build, `ops/caddy/Caddyfile` and the security headers | HTTPS (certificates in the `caddy_data` volume), the web app, `/api` to the API, `/mcp` to the MCP server, `/media` from the media volume after asking the API |
| `api` | `docker/api.Dockerfile` | the API, with accounts (`GE_AUTH_MODE=required`), writing uploads to the `media` volume |
| `mcp` | the API's image | remote MCP (`pnpm mcp:http`); on the internal network, every request needs a token |
| `migrate` | the API's image | the database migrations, once, before the API starts |
| `postgres` | `postgres:18.6` | the database, in the `pgdata` volume, on the internal network only |
| `backup` | `docker/backup.Dockerfile`: Postgres's client tools and rclone | the database and the media volume to a bucket, nightly, kept 30 days ([restore.md](restore.md)) |

The API and the MCP server run as the `node` user, on read-only filesystems: the API writes only to the media volume and `/tmp`. Postgres has no published port, and its network has no way out. The backup container reads the media volume, read-only, and reaches Postgres and the bucket; without `GE_BACKUP_S3_BUCKET` it does nothing ([restore.md](restore.md)).

The project is `galaxy-explorer-prod`, apart from the development databases (`galaxy-explorer`, docker/compose.dev.yml), so neither stack takes the other's containers for leftovers.

## Settings

Copy `docker/production.env.example` to `.env.production` (git ignores it), fill it in, and keep it to yourself (`chmod 600`). Every command passes it:

```bash
docker compose -f docker/compose.prod.yml --env-file .env.production up -d --build --wait
```

The two secrets are long random strings (`openssl rand -base64 48`). Changing `GE_SESSION_SECRET` later locks every account out of its two-factor codes.

## Trying it on your Mac

Use `127.0.0.1` as the site, on ports that nothing else holds:

```
GE_SITE_ADDRESS=127.0.0.1
GE_PUBLIC_URL=https://127.0.0.1:8443
GE_HTTP_PORT=8088
GE_HTTPS_PORT=8443
GE_DB_PASSWORD=…
GE_SESSION_SECRET=…
VITE_TEST_HOOKS=1
```

Caddy signs the certificate with its own authority, so the browser warns once; go on to the site. An IP address rather than `localhost`, because browsers ignore HSTS for IP addresses: from `localhost` the site's one-year HSTS header would send `pnpm dev`'s http://localhost:5173 to HTTPS too. `VITE_TEST_HOOKS=1` builds the web app with the e2e tests' hooks; leave it out for a real site.

## The first admin, and more accounts

The first admin is made in the API's container, where nobody else can watch:

```bash
docker compose -f docker/compose.prod.yml --env-file .env.production exec api node apps/api/src/auth/cli.ts create-user --admin
```

It asks for a username and password, and whether to set up two-factor codes (yes by default for an admin; optional per account, D-47). With codes, it prints the QR code and secret, and saves the account after one valid code. After that, invite people from the admin screen (`/admin`). The same command line prints invite and reset links (`invite [--admin]`, `reset-link <username>`), like `pnpm admin:*` locally.

## Testing it

With the stack running with `VITE_TEST_HOOKS=1`:

```bash
GE_STACK_ENV_FILE=$PWD/.env.production pnpm test:stack
```

It makes an account through an invite link from the API's container and signs in, then runs the golden path (`e2e/golden-path.spec.ts`) and the stack's own checks (`e2e/stack.spec.ts`: an image in a private universe reaches its owner through Caddy, and no one else) in Chromium and WebKit, under the site's Content-Security-Policy. It changes nothing else, and resets nothing.

## Day to day

| To | Run (with `-f docker/compose.prod.yml --env-file .env.production`) |
|---|---|
| see what's running | `docker compose … ps` |
| read logs | `docker compose … logs -f api` (or `caddy`, `mcp`, `postgres`) |
| stop | `docker compose … down` (keeps the volumes) |
| start again | `docker compose … up -d --wait` |

`down -v` deletes the volumes too: the database, the uploads and the certificates.
