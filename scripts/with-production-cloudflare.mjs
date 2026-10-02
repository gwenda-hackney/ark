#!/usr/bin/env node
/**
 * Run one command against the production Cloudflare account. A developer's
 * machine loads dev's token (gwenda-dev), so a hand-run Wrangler command on
 * production goes through here (#129). Wrangler caches the account it last
 * used for Pages and prefers that over CLOUDFLARE_ACCOUNT_ID, so production
 * gets its own cache folder.
 *
 *   node scripts/with-production-cloudflare.mjs npx wrangler pages project list
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareFor } from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: with-production-cloudflare.mjs <command> [args…]");
  process.exit(2);
}

const { token, accountId } = cloudflareFor("production");
const result = spawnSync(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    WRANGLER_CACHE_DIR: resolve(
      ROOT,
      "node_modules/.cache/wrangler-production",
    ),
  },
});
process.exit(result.status ?? 1);
