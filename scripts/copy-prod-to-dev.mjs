#!/usr/bin/env node
/**
 * Copy production over dev: website content (Sanity) and the backend
 * databases (Baserow today; scripts/lib/dev-copy/database.mjs). Production is
 * only read. On demand only: ops Developer tools → Copy production to dev, or
 * by hand. Runs in CI as copy-prod-to-dev.yml, which holds the production
 * read tokens.
 *
 *   node scripts/copy-prod-to-dev.mjs [--target=everything|content|ops-data|website-data] [--dry-run]
 *
 * Locally `npm run dev:refresh` does the same with your own logins.
 */
import { appendFileSync } from "node:fs";
import { COPY_TARGETS, copySteps, copySummary, runCopySteps } from "./lib/dev-copy/index.mjs";

function parseArgs(argv) {
  const out = { target: "everything", dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--target=")) out.target = arg.slice("--target=".length);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      `Usage: node scripts/copy-prod-to-dev.mjs [--target=${COPY_TARGETS.join("|")}] [--dry-run]`,
    );
    return;
  }
  const steps = copySteps(opts.target);
  console.log(`Copy production to dev: ${opts.target}${opts.dryRun ? " (dry run)" : ""}`);
  const results = await runCopySteps(steps, { dryRun: opts.dryRun });

  const summary = copySummary(opts.target, results, { dryRun: opts.dryRun });
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (results.some((result) => !result.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
