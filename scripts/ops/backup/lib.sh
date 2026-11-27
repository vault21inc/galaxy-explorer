# shellcheck shell=bash disable=SC2034 # its variables are used by the scripts that source it
# Shared by the backup container's commands (M8-T7, docs/ops/restore.md). Sourced, not run.
#
# A backup is a "set": one folder in the bucket, named by when it was made (UTC), holding
#
#   ge.dump        the database, `pg_dump --format=custom`
#   media.tar.gz   the media volume (uploaded images)
#   rows.tsv       each table's row count, read in the same snapshot as the dump
#   manifest.txt   when, from which release, how many media files
#   SHA256SUMS     the checksums of the four above, written last: a set without it is unfinished
#
# Postgres is reached through the PG* variables (compose.prod.yml sets them), the bucket
# through the GE_BACKUP_S3_* ones, which rclone reads as a remote called `offsite`.

set -euo pipefail

SETS_DIR=nightly
WORK=${GE_BACKUP_WORK:-/work}
MEDIA_DIR=${GE_BACKUP_MEDIA_DIR:-/media}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() {
  log "ERROR: $*" >&2
  exit 1
}

# Whether the bucket is set at all. Unset, the container says so and does nothing, as on a
# machine trying the stack (docs/ops/production.md).
configured() { [[ -n "${GE_BACKUP_S3_BUCKET:-}" ]]; }

# rclone takes a whole remote from RCLONE_CONFIG_<NAME>_* variables, so no config file is
# written. "Other" is plain S3, which DigitalOcean Spaces, Cloudflare R2 and MinIO all speak.
# no_check_bucket: a key limited to one bucket may not list or create buckets.
use_bucket() {
  configured || fail 'GE_BACKUP_S3_BUCKET is not set.'
  : "${GE_BACKUP_S3_ENDPOINT:?set GE_BACKUP_S3_ENDPOINT, such as https://sfo3.digitaloceanspaces.com}"
  : "${GE_BACKUP_S3_ACCESS_KEY_ID:?set GE_BACKUP_S3_ACCESS_KEY_ID}"
  : "${GE_BACKUP_S3_SECRET_ACCESS_KEY:?set GE_BACKUP_S3_SECRET_ACCESS_KEY}"
  export RCLONE_CONFIG_OFFSITE_TYPE=s3
  export RCLONE_CONFIG_OFFSITE_PROVIDER=Other
  export RCLONE_CONFIG_OFFSITE_ENDPOINT="$GE_BACKUP_S3_ENDPOINT"
  export RCLONE_CONFIG_OFFSITE_REGION="${GE_BACKUP_S3_REGION:-us-east-1}"
  export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$GE_BACKUP_S3_ACCESS_KEY_ID"
  export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$GE_BACKUP_S3_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
  export RCLONE_CONFIG_OFFSITE_ACL=private
  BUCKET="offsite:$GE_BACKUP_S3_BUCKET"
}

# The finished sets, oldest first: those with their SHA256SUMS.
finished_sets() {
  rclone lsf --recursive --files-only --include '*/SHA256SUMS' "$BUCKET/$SETS_DIR/" |
    sed 's|/SHA256SUMS$||' | sort
}

# The set named, or else the newest finished one.
pick_set() {
  local wanted="${1:-}" sets
  sets=$(finished_sets)
  [[ -n "$sets" ]] || fail "No finished backup in $BUCKET/$SETS_DIR/."
  if [[ -z "$wanted" ]]; then
    tail -n 1 <<<"$sets"
  elif grep -qx "$wanted" <<<"$sets"; then
    echo "$wanted"
  else
    fail "No finished backup named $wanted. These are: $(tr '\n' ' ' <<<"$sets")"
  fi
}

# Downloads a set into a folder and checks every file against its SHA256SUMS.
fetch_set() {
  local set="$1" into="$2"
  mkdir -p "$into"
  log "Downloading $set"
  rclone copy "$BUCKET/$SETS_DIR/$set/" "$into/"
  (cd "$into" && sha256sum --check --quiet SHA256SUMS) || fail "$set doesn't match its checksums."
  log "Checksums match"
}

# Every table's exact row count, as `schema.table<TAB>count`, sorted: one query, so it can run
# inside the backup's snapshot. query_to_xml runs the count for each table the catalog lists.
ROW_COUNTS_SQL="
  SELECT format('%s.%s', table_schema, table_name),
         (xpath('/row/n/text()',
                query_to_xml(format('SELECT count(*) AS n FROM %I.%I', table_schema, table_name),
                             false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY 1;"

# Loads a dump into a database that must not exist yet: created here, from template0 so that
# nothing from template1 comes along. --no-owner: whoever restores owns what's restored.
restore_into() {
  local database="$1" dump="$2"
  # Each step ends it on failure even where `set -e` is ignored (in an `if` condition).
  log "Creating database $database"
  psql -X -q -v ON_ERROR_STOP=1 -d postgres \
    -c "CREATE DATABASE \"$database\" TEMPLATE template0" || return 1
  log "Restoring into $database"
  pg_restore --dbname="$database" --no-owner --exit-on-error "$dump" || return 1
}
