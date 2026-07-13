#!/usr/bin/env bash
set -euo pipefail

# Install npm workspaces when package-lock changes
if [ -f /src/package-lock.json ]; then
  if [ ! -d /src/node_modules ] || [ /src/package-lock.json -nt /src/node_modules/.package-lock.json ] 2>/dev/null; then
    echo "Installing monorepo dependencies..."
    (cd /src && npm install)
  fi
fi

echo "Ark monorepo ready — web/, brand/, studio/, utils/"
