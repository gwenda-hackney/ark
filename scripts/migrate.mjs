#!/usr/bin/env node
/**
 * Run one app's deploy migrations for one environment (scripts/lib/migrations.mjs).
 * CI runs `pre` before each deploy and `post` once the new code is live.
 *
 *   node scripts/migrate.mjs --app web --phase pre --env production
 *   npm run migrate -- --app web --phase pre --env dev      # by hand
 *
 * Baserow changes log in as BASEROW_JWT_EMAIL / BASEROW_JWT_PASSWORD (CI:
 * scripts/sm-export.mjs), or prompt on a developer's machine. The login only
 * happens if a migration opens a database. D1 (`d1(role)`) uses this env's
 * CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID; its schema is applied first by
 * scripts/d1-migrate.mjs.
 */
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseFor } from "../shared/d1-env.js";
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import {
  APPS,
  ENVS,
  PHASES,
  loadMigrations,
  openDatabase,
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

const migrations = selectMigrations(await loadMigrations(resolve(ROOT, "migrations")), { app, phase });
console.log(`${app} ${phase}-deploy migrations for ${env}: ${migrations.length || "none"}`);
if (!migrations.length) process.exit(0);

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(/\/$/, "");
// What the migrations change that the website build reads.
const site = siteChanges();
let jwt = null;
const opened = new Map();
async function database(key) {
  jwt ??= await getBaserowJwt(apiBase, { hint: `${env} migrations` });
  if (!opened.has(key)) opened.set(key, await openDatabase({ apiBase, jwt, key, env, site }));
  return opened.get(key);
}
const d1 = (role) => databaseFor({ ...process.env, SITE_ENV: env }, role);
let content = null;
const sanity = () => (content ??= sanityContent({ env, processEnv: process.env, site }));

const { rebuild, changes } = await runMigrations(migrations, {
  env,
  processEnv: process.env,
  database,
  d1,
  sanity,
  site,
});
// CI rebuilds the website when a migration changed what it shows.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `rebuild=${rebuild}\n`);
if (rebuild) console.log(`The website shows what changed (${changes.join("; ")}): it needs a rebuild.`);
console.log("Done.");
