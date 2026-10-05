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
 * happens if a migration opens a database.
 */
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import {
  APPS,
  ENVS,
  PHASES,
  loadMigrations,
  openDatabase,
  runMigrations,
  selectMigrations,
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
let jwt = null;
const opened = new Map();
async function database(key) {
  jwt ??= await getBaserowJwt(apiBase, { hint: `${env} migrations` });
  if (!opened.has(key)) opened.set(key, await openDatabase({ apiBase, jwt, key, env }));
  return opened.get(key);
}

const { rebuild } = await runMigrations(migrations, { env, processEnv: process.env, database });
// CI rebuilds the website when a migration changed its content.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `rebuild=${rebuild}\n`);
if (rebuild) console.log("Website content changed: the site needs a rebuild.");
console.log("Done.");
