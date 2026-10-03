#!/usr/bin/env bash
# Deploy a commit on the server: update the checkout, rebuild, wait for health, and roll back to the
# previous commit if the new version does not come up healthy.
#
#   deploy/deploy.sh <git-sha>
#
# Run by the GitHub Actions deploy job over SSH; can also be run by hand. Needs deploy/.env.prod.
set -euo pipefail

SHA="${1:?usage: deploy/deploy.sh <git-sha>}"
cd "$(dirname "$0")/.."

ENV_FILE=deploy/.env.prod
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy deploy/.env.prod.example)"; exit 1; }
compose() { docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }

SITE="$(grep -E '^SITE_ADDRESS=' "$ENV_FILE" | cut -d= -f2-)"
PORT="$(grep -E '^HTTPS_PORT=' "$ENV_FILE" | cut -d= -f2- || true)"
# Checked from the server itself, through Caddy, so the whole path (TLS, proxies, API, DB) is covered.
HEALTH_URL="${HEALTH_URL:-https://${SITE}${PORT:+:$PORT}/health}"
CURL_OPTS=(-fsS --max-time 5)
[ "$SITE" = "localhost" ] && CURL_OPTS+=(-k)   # local rehearsal uses Caddy's internal CA

healthy() {
  for _ in $(seq 1 40); do
    if curl "${CURL_OPTS[@]}" "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

PREVIOUS="$(git rev-parse HEAD)"
echo "deploying $SHA (currently $PREVIOUS)"
git fetch --quiet origin
git checkout --quiet --force "$SHA"

if compose up -d --build --wait && healthy; then
  echo "deployed $SHA"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "!! $SHA did not become healthy; rolling back to $PREVIOUS" >&2
compose logs --tail 40 api >&2 || true
git checkout --quiet --force "$PREVIOUS"
compose up -d --build --wait
healthy && echo "rolled back to $PREVIOUS (still serving)" >&2
exit 1
