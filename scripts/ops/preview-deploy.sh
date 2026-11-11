#!/usr/bin/env bash
# Puts a version of the app live on the preview server (docs/ops/preview.md, step 5 and
# "Updating"). Run on the server as your admin user, from anywhere:
#
#   bash /srv/galaxy-explorer/app/scripts/ops/preview-deploy.sh [git ref, default origin/main]
#
# It fetches the code, installs and builds, starts Postgres, migrates the database, restarts
# the API, installs the Caddyfile and checks /api/health. A failing step stops it there.
set -euo pipefail

REF="${1:-origin/main}"
ROOT_DIR=/srv/galaxy-explorer
APP="$ROOT_DIR/app"
ENV_FILE="$ROOT_DIR/preview.env"
as_ge() { sudo -u ge -H bash -c "cd '$APP' && $1"; }

[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE is missing (ops/preview/preview.env.example)." >&2; exit 1; }

echo "== Code: $REF"
as_ge "git fetch --quiet --prune origin && git checkout --quiet --detach '$REF'"
as_ge "git log -1 --format='   %h %s'"

echo "== Install and build"
as_ge "pnpm install --frozen-lockfile --reporter=silent"
as_ge "pnpm --filter @ge/web build >/dev/null"

echo "== Database"
sudo docker compose --env-file "$ENV_FILE" -f "$APP/ops/preview/compose.yml" up -d --wait
as_ge "cd packages/db && node --env-file='$ENV_FILE' src/cli.ts migrate"

echo "== API"
sudo install -m 644 "$APP/ops/preview/galaxy-explorer-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --quiet galaxy-explorer-api
sudo systemctl restart galaxy-explorer-api
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then break; fi
  [[ $attempt -eq 30 ]] && { echo "The API didn't come up: journalctl -u galaxy-explorer-api" >&2; exit 1; }
  sleep 1
done
curl -fsS http://127.0.0.1:3100/api/health; echo

echo "== Caddy"
sudo install -m 644 "$APP/ops/preview/Caddyfile" /etc/caddy/Caddyfile
sudo systemctl reload-or-restart caddy
echo "Live."
