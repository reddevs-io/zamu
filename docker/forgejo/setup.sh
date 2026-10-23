#!/usr/bin/env bash
# Starts the test Forgejo, creates an admin user and an access token, and prints them as
# KEY=value lines on stdout:
#   FORGEJO_URL=http://localhost:3300
#   FORGEJO_USER=pm-admin
#   FORGEJO_PASSWORD=...
#   FORGEJO_TOKEN=...
# Environment: FORGEJO_PORT (default 3300), FORGEJO_PROJECT (compose project, default pm-forgejo),
# FORGEJO_TREES_PER_PAGE (default 10). Stop with teardown.sh using the same FORGEJO_PROJECT.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export FORGEJO_PORT="${FORGEJO_PORT:-3300}"
export FORGEJO_PROJECT="${FORGEJO_PROJECT:-pm-forgejo}"
compose=(docker compose -p "$FORGEJO_PROJECT" -f "$here/compose.yml")
user=pm-admin
password="pm-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"

"${compose[@]}" up -d --wait --quiet-pull >&2

forgejo() {
  "${compose[@]}" exec -T -u git forgejo forgejo "$@"
}

forgejo admin user create --admin --username "$user" --password "$password" \
  --email "$user@example.com" --must-change-password=false >&2
token="$(forgejo admin user generate-access-token --username "$user" --token-name "pm-test-$(date +%s)" \
  --scopes all --raw | tr -d '\r\n')"

echo "FORGEJO_URL=http://localhost:$FORGEJO_PORT"
echo "FORGEJO_USER=$user"
echo "FORGEJO_PASSWORD=$password"
echo "FORGEJO_TOKEN=$token"
