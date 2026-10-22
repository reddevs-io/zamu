#!/bin/sh
# Picks the container role from the first argument: web (default), worker, migrate, or pm (CLI).
# Any other command runs as is, so `docker run <image> sh` still works.
set -eu

role="${1:-web}"
if [ "$#" -gt 0 ]; then shift; fi

# docker/healthcheck.mjs reads the role: only the web role serves /api/healthz.
printf '%s' "$role" > /tmp/pm-role 2>/dev/null || true

case "$role" in
  web)
    exec node /app/web/server/index.mjs "$@"
    ;;
  worker)
    cd /app/worker
    exec node --import tsx src/index.ts "$@"
    ;;
  migrate)
    cd /app/worker
    exec node --import tsx migrate.ts "$@"
    ;;
  pm)
    exec node /app/cli/dist/index.js "$@"
    ;;
  *)
    exec "$role" "$@"
    ;;
esac
