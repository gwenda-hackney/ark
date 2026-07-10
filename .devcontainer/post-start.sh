#!/usr/bin/env bash
set -euo pipefail

# Install npm workspaces when package-lock changes
if [ -f /src/package-lock.json ]; then
  if [ ! -d /src/node_modules ] || [ /src/package-lock.json -nt /src/node_modules/.package-lock.json ] 2>/dev/null; then
    echo "Installing monorepo dependencies..."
    (cd /src && npm install)
  fi
fi

# Event-invites tool venv
INVITES_VENV=/src/utils/event-invites/.venv
if [ -f /src/utils/event-invites/pyproject.toml ]; then
  if [ ! -d "$INVITES_VENV" ]; then
    echo "Creating event-invites virtualenv..."
    python3 -m venv "$INVITES_VENV"
    "$INVITES_VENV/bin/pip" install -q -e /src/utils/event-invites
  fi
fi

echo "Ark monorepo ready — web/, brand/, utils/"
