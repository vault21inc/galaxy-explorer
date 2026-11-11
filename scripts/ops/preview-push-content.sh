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
# --no-mac-metadata: leave out macOS extended attributes, which Linux tar warns about.
tar --no-mac-metadata -C .data -czf "$WORK/media.tgz" media
ls -lh "$WORK"

echo "== Uploading"
scp -q "$WORK/ge.dump" "$WORK/media.tgz" "$HOST:/tmp/"

echo "== Restoring on the server"
# The restore runs as a file on the server, not fed through ssh's input, where any command
# reading its input (docker compose exec does) would swallow the rest of the script.
cat > "$WORK/restore.sh" <<'REMOTE'
set -euo pipefail
ROOT_DIR=/srv/galaxy-explorer
compose() { docker compose --env-file "$ROOT_DIR/preview.env" -f "$ROOT_DIR/app/ops/preview/compose.yml" "$@"; }
bash "$ROOT_DIR/app/scripts/ops/preview-backup.sh"
systemctl stop galaxy-explorer-api
# Whatever happens below, the API comes back up.
trap 'systemctl start galaxy-explorer-api' EXIT
# A fresh database, then the dump. (pg_restore --clean can't drop tables whose foreign keys
# point at themselves, such as celestial_objects.)
compose exec -T db sh -c 'dropdb -U ge --force ge && createdb -U ge ge' < /dev/null
compose exec -T db pg_restore -U ge -d ge --no-owner --exit-on-error < /tmp/ge.dump
rm -rf "$ROOT_DIR/media"
tar -C "$ROOT_DIR" -xzf /tmp/media.tgz
chown -R ge:ge "$ROOT_DIR/media"
rm -f /tmp/ge.dump /tmp/media.tgz /tmp/ge-restore.sh
systemctl start galaxy-explorer-api
for attempt in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1 && break
  sleep 1
done
echo "Objects on the server: $(compose exec -T db psql -U ge -d ge -tAc "select count(*) from celestial_objects" < /dev/null)"
REMOTE
scp -q "$WORK/restore.sh" "$HOST:/tmp/ge-restore.sh"
ssh "$HOST" 'sudo bash /tmp/ge-restore.sh'
echo "Done."
