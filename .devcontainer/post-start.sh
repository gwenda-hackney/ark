#!/usr/bin/env bash
set -euo pipefail

# Ark-only container bind-mounts the repo at /src. Nest container cwd is the nest root.
if [ -f /src/package-lock.json ] && { [ -d /src/marketing/web ] || [ -d /src/web ]; }; then
  ROOT=/src
elif [ -f "${PWD}/ark/package-lock.json" ]; then
  ROOT="${PWD}/ark"
elif [ -f "${PWD}/package-lock.json" ] && { [ -d "${PWD}/marketing/web" ] || [ -d "${PWD}/web" ]; }; then
  ROOT="${PWD}"
else
  echo "No ark package-lock.json found; skipping npm install."
  ROOT=""
fi

install_bw_session_bashrc() {
  local bashrc="/home/node/.bashrc"
  local snippet=""
  if [ -n "${ROOT:-}" ] && [ -f "$ROOT/.devcontainer/bw-session.bashrc" ]; then
    snippet="$ROOT/.devcontainer/bw-session.bashrc"
  elif [ -f /src/.devcontainer/bw-session.bashrc ]; then
    snippet=/src/.devcontainer/bw-session.bashrc
  elif [ -f "${PWD}/ark/.devcontainer/bw-session.bashrc" ]; then
    snippet="${PWD}/ark/.devcontainer/bw-session.bashrc"
  elif [ -f "${PWD}/.devcontainer/bw-session.bashrc" ]; then
    snippet="${PWD}/.devcontainer/bw-session.bashrc"
  fi
  if [ -z "$snippet" ] || [ ! -f "$bashrc" ]; then
    return 0
  fi
  if ! grep -q ">>> ark-bw-session >>>" "$bashrc" 2>/dev/null; then
    printf '\n' >> "$bashrc"
    cat "$snippet" >> "$bashrc"
  fi
}

install_bw_session_bashrc
if [ -d /commandhistory ]; then
  sudo chown node:node /commandhistory 2>/dev/null || true
fi

if [ -z "$ROOT" ]; then
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
  echo "Secrets: bw login && bw-unlock && npm run env:seed && npm run env:pull"
  echo "         (session persists in this container; see docs/env.md)"
fi
