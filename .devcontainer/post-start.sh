#!/usr/bin/env bash
set -euo pipefail

# Ark-only container bind-mounts the repo at /src. Nest container cwd is the nest root.
if [ -f /src/package-lock.json ] && [ -d /src/web ]; then
  ROOT=/src
elif [ -f "${PWD}/ark/package-lock.json" ]; then
  ROOT="${PWD}/ark"
elif [ -f "${PWD}/package-lock.json" ] && [ -d "${PWD}/web" ]; then
  ROOT="${PWD}"
else
  echo "No ark package-lock.json found; skipping npm install."
  exit 0
fi

# Install npm workspaces when package-lock changes
if [ ! -d "$ROOT/node_modules" ] || [ "$ROOT/package-lock.json" -nt "$ROOT/node_modules/.package-lock.json" ] 2>/dev/null; then
  echo "Installing monorepo dependencies..."
  (cd "$ROOT" && npm install)
fi

echo "Ark monorepo ready — web/, brand/, studio/, utils/"
# Bind-mounted host dir may be root-owned on first create
if [ -d "/home/node/.config/Bitwarden CLI" ]; then
  sudo chown -R node:node "/home/node/.config/Bitwarden CLI" 2>/dev/null || true
fi
if command -v bw >/dev/null 2>&1; then
  echo "Secrets: bw login && export BW_SESSION=\$(bw unlock --raw) && npm run env:seed && npm run env:pull"
  echo "         (see docs/env.md)"
fi
