#!/usr/bin/env bash
# The nightly backup (M8-T7, docs/ops/restore.md): the database and the media volume, to the
# bucket, as one set (lib.sh), keeping GE_BACKUP_KEEP_DAYS days of them.
#
#   backup.sh now        make one set now
#   backup.sh schedule   make one every day at GE_BACKUP_AT (UTC): the container's default
#
# The row counts and the dump read the database in one snapshot, so the restore drill can
# expect exactly those counts back, even if someone was editing while the backup ran.
source "$(dirname "$0")/lib.sh"

KEEP_DAYS=${GE_BACKUP_KEEP_DAYS:-30}
AT=${GE_BACKUP_AT:-03:30}

backup_now() {
  use_bucket
  local set dir snapshot line
  set=$(date -u +%Y%m%dT%H%M%SZ)
  dir="$WORK/$set"
  rm -rf "${WORK:?}"/*
  mkdir -p "$dir"
  log "Backing up as $set"

  # One open transaction holds the snapshot: psql reads the counts in it, and pg_dump joins
  # it with --snapshot. It has to stay open until the dump is done, so psql runs alongside as
  # a coprocess we write SQL to and read rows from. A marker row ends each answer.
  coproc SNAP { psql -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1; }
  printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;' \
    'SELECT pg_export_snapshot();' >&"${SNAP[1]}"
  read -r -t 60 -u "${SNAP[0]}" snapshot || fail 'No snapshot from Postgres.'
  printf '%s\n%s\n' "$ROW_COUNTS_SQL" "SELECT '-- end --';" >&"${SNAP[1]}"
  while read -r -t 600 -u "${SNAP[0]}" line && [[ "$line" != '-- end --' ]]; do
    printf '%s\n' "$line"
  done >"$dir/rows.tsv"
  [[ "$line" == '-- end --' ]] || fail 'The row counts never finished.'

  pg_dump --format=custom --snapshot="$snapshot" --file="$dir/ge.dump"
  printf '%s\n' 'COMMIT;' '\q' >&"${SNAP[1]}"
  wait "$SNAP_PID" || fail 'Closing the snapshot failed.'
  log "Database: $(du -h "$dir/ge.dump" | cut -f1), $(wc -l <"$dir/rows.tsv") tables"

  # After the dump: files are written before the rows that name them and never deleted
  # (asset-service.ts), so every file the dump names is already here.
  [[ -d "$MEDIA_DIR" ]] || fail "No media folder at $MEDIA_DIR."
  local media_files
  media_files=$(find "$MEDIA_DIR" -type f | wc -l)
  tar -C "$MEDIA_DIR" -czf "$dir/media.tar.gz" .
  log "Media: $media_files files, $(du -h "$dir/media.tar.gz" | cut -f1)"

  cat >"$dir/manifest.txt" <<MANIFEST
created=$(date -u +%Y-%m-%dT%H:%M:%SZ)
release=${GE_RELEASE:-unknown}
postgres=$(psql -X -A -t -c 'SHOW server_version')
tables=$(wc -l <"$dir/rows.tsv")
media_files=$media_files
MANIFEST
  (cd "$dir" && sha256sum ge.dump media.tar.gz rows.tsv manifest.txt >SHA256SUMS)

  # The checksums go last: until they're there, the set isn't finished (lib.sh).
  rclone copy --exclude SHA256SUMS "$dir/" "$BUCKET/$SETS_DIR/$set/"
  rclone copyto "$dir/SHA256SUMS" "$BUCKET/$SETS_DIR/$set/SHA256SUMS"
  rm -rf "$dir"
  log "Uploaded $set"
  prune
}

# Sets older than KEEP_DAYS, finished or not, by their names: UTC times that sort as text.
# Only after a set was uploaded, so the newest finished one is always kept.
prune() {
  local cutoff old
  cutoff=$(date -u -d "-$KEEP_DAYS days" +%Y%m%dT%H%M%SZ)
  rclone lsf --dirs-only "$BUCKET/$SETS_DIR/" | sed 's|/$||' | while read -r old; do
    if [[ "$old" < "$cutoff" ]]; then
      log "Deleting $old (over $KEEP_DAYS days)"
      rclone purge "$BUCKET/$SETS_DIR/$old"
    fi
  done
}

# Tells a monitor how it went, if there is one: GE_BACKUP_PING_URL on success, and the same
# with /fail on failure, as healthchecks.io takes them. A monitor that hears nothing for a day
# and a bit then emails you, which also covers the container not running at all.
ping_monitor() {
  [[ -n "${GE_BACKUP_PING_URL:-}" ]] || return 0
  local url="$GE_BACKUP_PING_URL"
  [[ "$1" == ok ]] || url="$url/fail"
  curl -fsS -m 10 --retry 3 -o /dev/null "$url" || log "Couldn't reach the monitor."
}

schedule() {
  if ! configured; then
    log 'Backups are off: GE_BACKUP_S3_BUCKET is not set (docs/ops/restore.md).'
    exec sleep infinity
  fi
  # Find out at start, not at 03:30, if the bucket or its key is wrong: the deploy prints this.
  use_bucket
  if rclone lsf --max-depth 1 "$BUCKET/" >/dev/null; then
    log "Backups on: $GE_BACKUP_S3_BUCKET, daily at $AT UTC, kept $KEEP_DAYS days."
  else
    log "ERROR: can't list $GE_BACKUP_S3_BUCKET: check the GE_BACKUP_S3_* settings." >&2
  fi
  local now next
  while true; do
    now=$(date -u +%s)
    next=$(date -u -d "today $AT" +%s)
    ((next > now)) || next=$(date -u -d "tomorrow $AT" +%s)
    sleep $((next - now))
    # A process of its own: a failure ends that night's run, not the schedule. (Not a
    # subshell: bash ignores `set -e` inside an `if` condition, subshells included.)
    if "$0" now; then ping_monitor ok; else ping_monitor fail; fi
  done
}

case "${1:-}" in
  now) backup_now ;;
  schedule) schedule ;;
  *) fail "Usage: backup.sh now|schedule" ;;
esac
