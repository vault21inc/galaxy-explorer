#!/usr/bin/env bash
# The finished backups in the bucket, oldest first, with their sizes (M8-T7).
source "$(dirname "$0")/lib.sh"

use_bucket
sets=$(finished_sets)
[[ -n "$sets" ]] || { log "No finished backup in $BUCKET/$SETS_DIR/."; exit 0; }
while read -r set; do
  printf '%s  %s\n' "$set" "$(rclone size --json "$BUCKET/$SETS_DIR/$set/" |
    sed -n 's/.*"bytes":\([0-9]*\).*/\1/p' | numfmt --to=iec)"
done <<<"$sets"
