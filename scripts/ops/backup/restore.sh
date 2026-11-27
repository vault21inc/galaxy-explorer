#!/usr/bin/env bash
# Puts a backup back in place of the live data (M8-T7). Follow docs/ops/restore.md, which
# stops the API first and mounts the media volume writable for this one run.
#
#   restore.sh <set> --replace
#
# 1. download the set and check its checksums;
# 2. refuse while anything else is connected to the live database (stop the API and MCP);
# 3. rename the live database to ge_before_<time>, keeping it until you drop it, and restore
#    the dump as a new `ge`; if that fails, the old one is renamed back;
# 4. unpack the images over the media volume, if it's mounted at /media-restore. Files the
#    backup has are put back; files added since stay, unused, which harms nothing.
source "$(dirname "$0")/lib.sh"

LIVE_DB=${PGDATABASE:-ge}
set_name="${1:-}"
[[ -n "$set_name" && "${2:-}" == --replace ]] ||
  fail "Usage: restore.sh <set> --replace   (the sets: list.sh)"

use_bucket
set=$(pick_set "$set_name")
dir="$WORK/restore-$set"
rm -rf "$dir"
trap 'rm -rf "$dir"' EXIT
fetch_set "$set" "$dir"
sed 's/^/  /' "$dir/manifest.txt"

others=$(psql -X -A -t -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = '$LIVE_DB' AND pid <> pg_backend_pid()")
[[ "$others" == 0 ]] ||
  fail "$others connections to $LIVE_DB are open: stop the api and mcp services first."

kept="ge_before_$(date -u +%Y%m%dT%H%M%SZ)"
log "Keeping the live database as $kept"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "ALTER DATABASE \"$LIVE_DB\" RENAME TO \"$kept\""
if ! restore_into "$LIVE_DB" "$dir/ge.dump"; then
  log "The restore failed: putting $kept back as $LIVE_DB" >&2
  psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$LIVE_DB\""
  psql -X -q -d postgres -c "ALTER DATABASE \"$kept\" RENAME TO \"$LIVE_DB\""
  exit 1
fi
log "Database restored from $set. The one it replaced is $kept: drop it once all is well."

if [[ -d /media-restore && -w /media-restore ]]; then
  tar -C /media-restore -xzf "$dir/media.tar.gz"
  log "Media unpacked: $(sed -n 's/^media_files=//p' "$dir/manifest.txt") files"
else
  log "Media left as it is: mount the media volume at /media-restore to put the images back."
fi
