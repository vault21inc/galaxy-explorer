# Deploying

How a release reaches the production droplet (M8-T6), and how to undo one. The stack is in [production.md](production.md), the droplet in [droplet.md](droplet.md).

## Releasing

A version tag deploys it:

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

Or deploy any branch or tag by hand, from the Actions tab or:

```bash
gh workflow run deploy.yml --ref main
```

The workflow (`.github/workflows/deploy.yml`):

1. builds the API's and the web's images and pushes them to GHCR, named by the commit (`ghcr.io/vault21inc/galaxy-explorer-api:<commit>`), and by the version on a tag;
2. copies the release's `docker/compose.prod.yml` and `scripts/ops/deploy-release.sh` to `/srv/galaxy-explorer/releases/<commit>/` on the droplet;
3. logs the droplet in to GHCR with the run's own token (logged out again at the end, whatever happened), and runs the script.

The script pulls the images and starts the release: the migrations first, then every service, each of which must pass its health check. Then it checks `/api/health` the way a visitor gets it, through Caddy at the site's address. Healthy, the release is recorded in `/srv/galaxy-explorer/current`, and the last 5 releases are kept. Not healthy, the previous release is started again and the run fails, with the containers' state and the last log lines in its output.

## Rolling back

**On its own:** a release that doesn't come up healthy is replaced by the one before it, in the same run.

**By hand:** run the script of an earlier release on the droplet. Its images are still there (the last 5 releases'), so no registry login is needed:

```bash
ssh deploy@<droplet> 'ls -t /srv/galaxy-explorer/releases; cat /srv/galaxy-explorer/current'
ssh deploy@<droplet> 'bash /srv/galaxy-explorer/releases/<commit>/deploy-release.sh <commit>'
```

**Migrations aren't undone.** A rollback runs the earlier code on the current database, so a migration must keep the release before it working: add a column in one release, and stop using the old one in a later release.

## Logs and state

On the droplet, as `deploy`, with the live release's compose file:

```bash
cd /srv/galaxy-explorer
stack() { docker compose -f "releases/$(cat current)/compose.prod.yml" --env-file .env.production "$@"; }
stack ps
stack logs -f api          # or caddy, mcp, postgres, migrate
stack logs --since 1h api
```

The workflow's own output is in the Actions tab: each run shows the release, the health checks and, if it rolled back, why.

## Access

The workflow logs in with its own SSH key, kept in the repository's `production` environment with the droplet's address and pinned host keys:

| Secret | Holds |
|---|---|
| `DEPLOY_HOST` | the droplet's IPv4 address |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the private key; its public half is in `deploy`'s `authorized_keys`, marked `restrict` (no terminal, no forwarding) |
| `DEPLOY_KNOWN_HOSTS` | the droplet's host keys: a server answering with another key is refused |

To replace the key: make a new pair, add its public half to `~/.ssh/authorized_keys` as `restrict ssh-ed25519 …`, set `DEPLOY_SSH_KEY` to the private half, run a deploy, then remove the old line.
