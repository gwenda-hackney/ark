#!/usr/bin/env node
/**
 * @deprecated Prefer `npm run setup:sanity-tokens`.
 * Thin wrapper that recreates CI Viewer + Deploy Studio and pushes GitHub secrets.
 * Uses personal Sanity CLI session (or SANITY_AUTH_TOKEN), not a robot in .env.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
console.warn(
  "setup:ci-secrets is deprecated — use `npm run setup:sanity-tokens` for full cleanup.\n" +
    "Running CI token + GitHub sync only (skips Bitwarden; does not revoke extras)…\n",
);

const result = spawnSync(
  process.execPath,
  [resolve(root, "scripts/setup-sanity-tokens.mjs"), "--skip-bitwarden"],
  { stdio: "inherit", cwd: root, env: process.env },
);
process.exit(result.status ?? 1);
