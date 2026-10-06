#!/usr/bin/env node
/**
 * Apply D1 schema migrations (db/<role>/migrations/*.sql) to this
 * environment's databases. Deploys run it before their other migrations, so
 * new tables and columns exist before code that needs them (#191).
 *
 *   node scripts/d1-migrate.mjs --env dev|production [--db ops,website,config] [--dry-run]
 *
 * Uses CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for that environment's
 * account (CI pulls them per env). Databases not created yet are skipped.
 */
import { applyD1Migrations, d1MigrationPlan } from "./lib/d1-migrate.mjs";

function parseArgs(argv) {
  const out = { env: "", roles: undefined, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env") out.env = argv[++i] || "";
    else if (arg === "--db")
      out.roles = String(argv[++i] || "")
        .split(",")
        .filter(Boolean);
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help || !opts.env) {
  console.log(
    "Usage: node scripts/d1-migrate.mjs --env dev|production [--db ops,website,config] [--dry-run]",
  );
  process.exit(opts.help ? 0 : 2);
}

try {
  await applyD1Migrations(d1MigrationPlan(opts.env, opts.roles), {
    dryRun: opts.dryRun,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
