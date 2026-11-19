#!/usr/bin/env bash
# Stops the test Forgejo and removes its container and data volume.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export FORGEJO_PROJECT="${FORGEJO_PROJECT:-zamu-forgejo}"
docker compose -p "$FORGEJO_PROJECT" -f "$here/compose.yml" down --volumes --remove-orphans >&2
