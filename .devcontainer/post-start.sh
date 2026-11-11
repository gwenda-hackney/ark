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
  # Replace the block every start, so a changed snippet reaches existing containers.
  sed -i '/>>> ark-bw-session >>>/,/<<< ark-bw-session <<</d' "$bashrc"
  [ -n "$(tail -c1 "$bashrc")" ] && printf '\n' >> "$bashrc"
  cat "$snippet" >> "$bashrc"
}

install_bw_session_bashrc
if [ -d /commandhistory ]; then
  sudo chown node:node /commandhistory 2>/dev/null || true
fi
# Claude Code chats live in ~/.claude; the named volume keeps them across rebuilds
if [ -d /home/node/.claude ]; then
  sudo chown node:node /home/node/.claude 2>/dev/null || true
fi
# Claude Code's settings file lives in that volume too (CLAUDE_CONFIG_DIR, docker-compose.yml), so
# folder trust survives a rebuild. The first start with it takes home's copy in.
claude_config="/home/node/.claude/.claude.json"
if [ ! -e "$claude_config" ] && [ -f /home/node/.claude.json ]; then
  cp -p /home/node/.claude.json "$claude_config"
  chmod 600 "$claude_config"
fi
# Remote Control starts with the container, so claude.ai/code and the phone can open sessions in
# here (README: Dev container). The script is the owner's dotfiles' (VS Code installs it); it
# returns at once when Remote Control is already running, and is skipped where it isn't installed.
if [ -x /home/node/.local/bin/claude-remote ]; then
  /home/node/.local/bin/claude-remote </dev/null || true
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
  echo "Secrets: bw login && bw-unlock (then every npm script loads them; docs/env.md)"
  git -C "$ROOT" config user.email >/dev/null || echo "         git config user.email you@gwenda.co.uk (local form emails go there)"
fi
