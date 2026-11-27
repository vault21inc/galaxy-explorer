#!/usr/bin/env bash
# Puts one release live on the production droplet (M8-T6, docs/ops/deploy.md), or, if it
# doesn't come up healthy, puts the previous one back. The deploy workflow copies this script
# and the release's compose file to /srv/galaxy-explorer/releases/<tag>/ and runs:
#
#   bash /srv/galaxy-explorer/releases/<tag>/deploy-release.sh <tag>
#
# A release is named by its git commit, and so are its images. By hand, as deploy, the same
# command with an earlier release's tag rolls back to it (its images are kept on the droplet).
#
# 1. pull the release's images (logged in to GHCR beforehand by the workflow);
# 2. `up`: the migrations run first (the `migrate` service), then the rest, and every
#    container must pass its health check;
# 3. check the whole path: through Caddy at the site's address once it points here, else
#    from Caddy's container to the API (before go-live, the name points at the old server);
# 4. record the release as current and keep the last few; or, if 2 or 3 failed, start the
#    previous release again and exit with an error, so the workflow fails.
#
# A rollback starts the previous images on the current database: migrations aren't undone, so
# they must keep working with the release before them (add, then remove a release later).
set -euo pipefail

TAG="${1:?Usage: deploy-release.sh <tag>}"
ROOT=/srv/galaxy-explorer
ENV_FILE="$ROOT/.env.production"
CURRENT_FILE="$ROOT/current"
# The last releases kept on the droplet, files and images: rollback needs the one before.
KEEP=5
export GE_IMAGE_PREFIX="${GE_IMAGE_PREFIX:-ghcr.io/vault21inc/galaxy-explorer}"

compose() {
  local tag="$1"
  shift
  GE_IMAGE_TAG="$tag" docker compose -f "$ROOT/releases/$tag/compose.prod.yml" \
    --env-file "$ENV_FILE" "$@"
}

setting() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

healthy() {
  local tag="$1" site here there
  site=$(setting GE_SITE_ADDRESS)
  here=$(curl -fsS -m 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || true)
  there=$(getent ahostsv4 "$site" | awk 'NR == 1 { print $1 }')
  for attempt in $(seq 1 10); do
    if [[ -n "$here" && "$there" == "$here" ]]; then
      # Live: what a visitor gets, certificate included.
      curl -fsS -m 10 "https://$site/api/health" >/dev/null && return 0
    else
      compose "$tag" exec -T caddy wget -qO /dev/null http://api:3000/api/health && return 0
    fi
    sleep 3
  done
  return 1
}

prune() {
  local keep
  keep=$(ls -1t "$ROOT/releases" | head -n "$KEEP")
  for dir in "$ROOT/releases"/*; do
    grep -qx "$(basename "$dir")" <<<"$keep" || rm -rf "$dir"
  done
  docker image ls --format '{{.Repository}}:{{.Tag}}' \
    --filter "reference=$GE_IMAGE_PREFIX-*" | while read -r image; do
    grep -qx "${image##*:}" <<<"$keep" || docker image rm "$image" >/dev/null || true
  done
}

[[ -f "$ROOT/releases/$TAG/compose.prod.yml" ]] || { echo "No release $TAG here." >&2; exit 1; }
PREVIOUS=$(cat "$CURRENT_FILE" 2>/dev/null || true)
echo "== Release $TAG (live now: ${PREVIOUS:-none})"

# A release already here (a rollback by hand, a second try) needs no registry login.
if docker image inspect "$GE_IMAGE_PREFIX-api:$TAG" "$GE_IMAGE_PREFIX-web:$TAG" \
  "$GE_IMAGE_PREFIX-backup:$TAG" >/dev/null 2>&1; then
  echo "   Its images are here already."
else
  compose "$TAG" pull api caddy backup
fi
if compose "$TAG" up -d --wait --remove-orphans && healthy "$TAG"; then
  echo "$TAG" >"$CURRENT_FILE"
  prune
  echo "== Live: $TAG"
  # The backup container checks its bucket as it starts (M8-T7): say what it found, so a
  # wrong key shows in the deploy's output rather than as a missing backup weeks later.
  sleep 5
  compose "$TAG" logs --no-log-prefix --tail 3 backup || true
  exit 0
fi

echo "== Release $TAG isn't healthy" >&2
compose "$TAG" ps -a >&2 || true
compose "$TAG" logs --tail 40 api migrate >&2 || true
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" ]]; then
  echo "== Rolling back to $PREVIOUS" >&2
  if compose "$PREVIOUS" up -d --wait --remove-orphans && healthy "$PREVIOUS"; then
    echo "== Rolled back: $PREVIOUS is live again" >&2
  else
    echo "== The rollback isn't healthy either: look at the logs (docs/ops/deploy.md)" >&2
  fi
fi
exit 1
