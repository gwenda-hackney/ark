#!/usr/bin/env node
/**
 * Run one app's deploy migrations for one environment (scripts/lib/migrations.mjs).
 * CI runs `pre` before each deploy and `post` once the new code is live.
 *
 *   node scripts/migrate.mjs --app web --phase pre --env production
 *   npm run migrate -- --app web --phase pre --env dev      # by hand
 *   ... --only 2026-11-17-chez-pickle-wed-sun --dry-run  # one migration, reporting only
 *
 * --only <name> runs just that migration (its file name without .mjs).
 * --dry-run passes `dryRun` to the migrations, which then change nothing;
 * use it with --only, since not every migration supports it.
 *
 * D1 (`d1(role)`) uses this env's CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID;
 * its schema is applied first by scripts/d1-migrate.mjs. Sanity (`sanity()`)
 * uses SANITY_API_TOKEN.
 */
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseFor } from "../shared/d1-env.js";
import {
  APPS,
  ENVS,
  PHASES,
  loadMigrations,
  runMigrations,
  sanityContent,
  selectMigrations,
  siteChanges,
} from "./lib/migrations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, allowed) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!allowed.includes(value)) {
    console.error(`--${name} must be one of: ${allowed.join(", ")}`);
    process.exit(2);
  }
  return value;
}

const app = arg("app", APPS);
const phase = arg("phase", PHASES);
const env = arg("env", ENVS);

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] || "" : "";
const dryRun = process.argv.includes("--dry-run");
if (dryRun && !only) {
  console.error("--dry-run needs --only <migration>: not every migration supports it.");
  process.exit(2);
}
const migrations = selectMigrations(await loadMigrations(resolve(ROOT, "migrations")), { app, phase }).filter(
  (migration) => !only || migration.name === only || migration.name === `${only}.mjs`,
);
if (only && !migrations.length) {
  console.error(`No ${app} ${phase} migration named ${only}.`);
  process.exit(2);
}
console.log(`${app} ${phase}-deploy migrations for ${env}: ${migrations.length || "none"}`);
if (!migrations.length) process.exit(0);

// What the migrations change that the website build reads.
const site = siteChanges();
const d1 = (role) => databaseFor({ ...process.env, SITE_ENV: env }, role);
let content = null;
const sanity = () => (content ??= sanityContent({ env, processEnv: process.env, site }));

const { rebuild, changes } = await runMigrations(migrations, {
  env,
  processEnv: process.env,
  d1,
  sanity,
  site,
  dryRun,
});
// CI rebuilds the website when a migration changed what it shows.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `rebuild=${rebuild}\n`);
if (rebuild) console.log(`The website shows what changed (${changes.join("; ")}): it needs a rebuild.`);
console.log("Done.");
