#!/usr/bin/env node
/**
 * Sanitize a git branch name for Cloudflare Pages `wrangler pages deploy --branch`.
 * Usage: node cloudflare-pages-branch.mjs [ref-name]
 *        GITHUB_REF_NAME is used when no argument is passed.
 *
 * scripts/lib/pages-cleanup.mjs imports pagesBranch to find a closed PR's
 * previews by the same name.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The Pages branch a git branch deploys as; "" when nothing usable is left. */
export function pagesBranch(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 58);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = process.argv[2] || process.env.GITHUB_REF_NAME || "";
  const sanitized = pagesBranch(raw);
  if (!sanitized) {
    console.error(`Could not sanitize branch name: "${raw}"`);
    process.exit(1);
  }
  process.stdout.write(sanitized);
}
