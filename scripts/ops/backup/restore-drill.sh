#!/usr/bin/env bash
# The restore drill (M8-T7, docs/ops/restore.md): proves a backup restores, without touching
# the live database.
#
#   restore-drill.sh [set]   the newest finished set, or the one named
#
# 1. download the set and check its checksums;
# 2. restore the dump into a scratch database, `ge_restore_drill`, on the same server;
# 3. count every table's rows there and compare them with rows.tsv, which the backup counted
#    in the dump's own snapshot, so they must match exactly;
# 4. count the files in the media archive and compare them with the manifest;
# 5. drop the scratch database, whatever happened.
source "$(dirname "$0")/lib.sh"

SCRATCH_DB=ge_restore_drill

drop_scratch() {
  PGOPTIONS="-c client_min_messages=warning" \
    psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB WITH (FORCE)" || true
}

use_bucket
set=$(pick_set "${1:-}")
dir="$WORK/drill-$set"
rm -rf "$dir"
trap 'drop_scratch; rm -rf "$dir"' EXIT
log "Drill: $set"
fetch_set "$set" "$dir"
sed 's/^/  /' "$dir/manifest.txt"

# A drill left behind by one that was cut short.
drop_scratch
restore_into "$SCRATCH_DB" "$dir/ge.dump"

psql -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -d "$SCRATCH_DB" -c "$ROW_COUNTS_SQL" \
  >"$dir/restored-rows.tsv"
if ! diff -u "$dir/rows.tsv" "$dir/restored-rows.tsv" >"$dir/rows.diff"; then
  cat "$dir/rows.diff" >&2
  fail "The restored row counts differ from the backup's (above: - backup, + restored)."
fi
log "Rows: all $(wc -l <"$dir/rows.tsv") tables match ($(awk -F'\t' '{ n += $2 } END { print n }' "$dir/rows.tsv") rows)"

expected=$(sed -n 's/^media_files=//p' "$dir/manifest.txt")
archived=$(tar -tzf "$dir/media.tar.gz" | grep -vc '/$' || true)
[[ "$archived" == "$expected" ]] ||
  fail "The media archive holds $archived files; the backup counted $expected."
log "Media: all $expected files are in the archive"

log "Drill passed: $set restores."
