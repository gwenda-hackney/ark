#!/usr/bin/env node
/**
 * Local one-shot sync (uses repo-root .env via npm run subscribe-mailchimp-sync).
 *
 *   npm run subscribe-mailchimp-sync -- --dry-run
 *   npm run subscribe-mailchimp-sync -- --limit 20
 */
import { syncUnsyncedSubscribers } from "../src/sync";
import type { Env } from "../src/types";

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const all = argv.includes("--all");
  const limitIdx = argv.indexOf("--limit");
  const limitRaw = limitIdx >= 0 ? argv[limitIdx + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  return {
    dryRun,
    all,
    limit:
      limit !== undefined && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined,
  };
}

async function main() {
  const { dryRun, all, limit } = parseArgs(process.argv.slice(2));

  const env: Env = {
    BASEROW_API_KEY: process.env.BASEROW_API_KEY ?? "",
    MAILCHIMP_API_KEY: process.env.MAILCHIMP_API_KEY ?? "",
    SYNC_SECRET: process.env.SUBSCRIBE_MAILCHIMP_SYNC_SECRET ?? "",
    MAILCHIMP_AUDIENCE_ID:
      process.env.MAILCHIMP_AUDIENCE_ID ||
      process.env.SUBSCRIBE_MAILCHIMP_AUDIENCE_ID ||
      "e2c69d5d31",
    BASEROW_DATABASE_ID:
      process.env.BASEROW_DATABASE_ID ||
      process.env.SUBSCRIBE_MAILCHIMP_BASEROW_DATABASE_ID ||
      "461843",
    BASEROW_SYNC_LOG_TABLE_ID: process.env.BASEROW_SYNC_LOG_TABLE_ID,
    BASEROW_API_URL: process.env.BASEROW_API_URL,
  };

  const summary = await syncUnsyncedSubscribers(env, {
    dryRun,
    all,
    limit,
    trigger: "cli",
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
