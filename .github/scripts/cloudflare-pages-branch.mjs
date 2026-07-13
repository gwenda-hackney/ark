#!/usr/bin/env node
/**
 * Sanitize a git branch name for Cloudflare Pages `wrangler pages deploy --branch`.
 * Usage: node cloudflare-pages-branch.mjs [ref-name]
 *        GITHUB_REF_NAME is used when no argument is passed.
 */
const raw = process.argv[2] || process.env.GITHUB_REF_NAME || "";
const sanitized = raw
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 58);

if (!sanitized) {
  console.error(`Could not sanitize branch name: "${raw}"`);
  process.exit(1);
}

process.stdout.write(sanitized);
