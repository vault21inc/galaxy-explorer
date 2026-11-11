#!/usr/bin/env bash
# The preview's nightly backup (docs/ops/preview.md, "Backups"): the database and the uploaded
# images, kept 14 days in /srv/galaxy-explorer/backups. Run by cron as root; safe to run by hand.
set -euo pipefail

ROOT_DIR=/srv/galaxy-explorer
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
OUT="$ROOT_DIR/backups"

compose() { docker compose --env-file "$ROOT_DIR/preview.env" -f "$ROOT_DIR/app/ops/preview/compose.yml" "$@"; }
compose exec -T db pg_dump -U ge -d ge --format=custom > "$OUT/ge-$STAMP.dump"
tar -C "$ROOT_DIR" -czf "$OUT/media-$STAMP.tgz" media
find "$OUT" -type f -mtime +14 -delete
echo "$STAMP backed up: $(du -sh "$OUT/ge-$STAMP.dump" | cut -f1) database, $(du -sh "$OUT/media-$STAMP.tgz" | cut -f1) media"
