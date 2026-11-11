#!/usr/bin/env bash
# Copies your local content (the dev database and uploaded images) to the preview server,
# replacing everything there (docs/ops/preview.md, step 6). Run on your Mac from the repository:
#
#   bash scripts/ops/preview-push-content.sh deploy@your-server
#
# Deploy the same version of the app first, so the database schema matches. The server's
# current content is backed up before it's replaced.
set -euo pipefail

HOST="${1:?Usage: preview-push-content.sh admin@server}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

read -r -p "This replaces all content on $HOST with your local content. Continue? [y/N] " answer
[[ "$answer" == [yY] ]] || exit 1

echo "== Dumping the local database and images"
docker compose -f docker/compose.dev.yml exec -T db pg_dump -U ge -d ge --format=custom > "$WORK/ge.dump"
tar -C .data -czf "$WORK/media.tgz" media
ls -lh "$WORK"

echo "== Uploading"
scp -q "$WORK/ge.dump" "$WORK/media.tgz" "$HOST:/tmp/"

echo "== Restoring on the server"
ssh "$HOST" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
ROOT_DIR=/srv/galaxy-explorer
compose() { docker compose --env-file "$ROOT_DIR/preview.env" -f "$ROOT_DIR/app/ops/preview/compose.yml" "$@"; }
bash "$ROOT_DIR/app/scripts/ops/preview-backup.sh"
systemctl stop galaxy-explorer-api
compose exec -T db pg_restore -U ge -d ge --clean --if-exists --no-owner --single-transaction < /tmp/ge.dump
rm -rf "$ROOT_DIR/media"
tar -C "$ROOT_DIR" -xzf /tmp/media.tgz
chown -R ge:ge "$ROOT_DIR/media"
rm -f /tmp/ge.dump /tmp/media.tgz
systemctl start galaxy-explorer-api
sleep 2
curl -fsS http://127.0.0.1:3100/api/health; echo
REMOTE
echo "Done."
