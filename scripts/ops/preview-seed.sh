#!/usr/bin/env bash
# Resets the preview to the demo content testers explore (docs/ops/preview.md, "Demo content"):
# a backup first, then a fresh database, migrated, with the demo universe seeded
# (apps/api/src/seeds/demo.ts). Run on the server as your admin user:
#
#   sudo bash /srv/galaxy-explorer/app/scripts/ops/preview-seed.sh
#
# Everything on the preview is replaced, including anything copied up from your machine; the
# backup in /srv/galaxy-explorer/backups keeps it.
set -euo pipefail

ROOT_DIR=/srv/galaxy-explorer
ENV_FILE="$ROOT_DIR/preview.env"
compose() { docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/app/ops/preview/compose.yml" "$@"; }
as_ge() { sudo -u ge -H bash -c "$1"; }

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "This replaces all content on the preview with the demo universe. Continue? [y/N] " answer
  [[ "$answer" == [yY] ]] || exit 1
fi

echo "== Backing up what's there"
bash "$ROOT_DIR/app/scripts/ops/preview-backup.sh"

systemctl stop galaxy-explorer-api
# Whatever happens below, the API comes back up.
trap 'systemctl start galaxy-explorer-api' EXIT

echo "== A fresh database, migrated and seeded"
compose exec -T db sh -c 'dropdb -U ge --force ge && createdb -U ge ge' < /dev/null
as_ge "cd '$ROOT_DIR/app/packages/db' && node --env-file='$ENV_FILE' src/cli.ts migrate"
as_ge "cd '$ROOT_DIR/app/apps/api' && node --env-file='$ENV_FILE' src/seeds/cli.ts demo"
# The images belonged to the old content; the backup has them.
find "$ROOT_DIR/media" -mindepth 1 -delete

systemctl start galaxy-explorer-api
for attempt in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1 && break
  sleep 1
done
echo "Universes: $(compose exec -T db psql -U ge -d ge -tAc "select string_agg(slug, ', ') from universes" < /dev/null)"
echo "Objects: $(compose exec -T db psql -U ge -d ge -tAc "select count(*) from celestial_objects" < /dev/null)"
