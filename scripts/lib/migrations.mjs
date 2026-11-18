/**
 * Deploy migrations: changes to data the apps share (D1 rows, config,
 * Sanity content) that a code change depends on. Expand/contract:
 *
 *   pre   runs before the app deploys. Only adds, so the code still running
 *         keeps working next to the new code.
 *   post  runs after the app is live. Removes what only the old code used.
 *
 * Each migration is a file in migrations/ (run in filename order):
 *
 *   export const app = "ops";          // whose deploy runs it: "web" | "ops"
 *   export const phase = "post";       // "pre" | "post"
 *   export const about = "Events: one Happy Hour";
 *   export async function up({ env, d1, sanity, processEnv, log, dryRun }) {
 *     const ops = await d1("ops");
 *     ...
 *   }
 *
 * `d1(role)` is this environment's D1 database ("ops" | "website" | "config",
 * shared/d1.js helpers apply; schema changes go in db/<role>/migrations/*.sql
 * instead); `sanity()` its Sanity content, which notes changes to published
 * documents: the site was built before the post migrations, so CI then
 * rebuilds it from the migrated data.
 *
 * `dryRun` (migrate.mjs --dry-run) asks a migration to report what it would
 * do and change nothing; a migration that changes data supports it.
 *
 * Nothing records which migrations ran. Every deploy runs them all, so each
 * one checks the real state first and does nothing when it's already done.
 * A record would lie after `copy-prod-to-dev` replaces a copy from production.
 * Delete a migration once it has run in production.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../../shared/sanity-projects.js";

export const PHASES = ["pre", "post"];
export const APPS = ["web", "ops"];
/** Dev mirrors production; there is no staging environment. */
export const ENVS = ["dev", "production"];

/** What a run changed that the website shows. `rebuild` once there is any. */
export function siteChanges() {
  const changes = [];
  return {
    changes,
    note: (what) => changes.push(what),
    get rebuild() {
      return changes.length > 0;
    },
  };
}

/** Check a migration module's exports; returns it with its name. */
export function checkMigration(name, mod) {
  const problems = [];
  if (!APPS.includes(mod.app)) problems.push(`app must be one of ${APPS.join(", ")}`);
  if (!PHASES.includes(mod.phase)) problems.push(`phase must be one of ${PHASES.join(", ")}`);
  if (typeof mod.about !== "string" || !mod.about.trim()) problems.push("about is missing");
  if (typeof mod.up !== "function") problems.push("up() is missing");
  if (problems.length) throw new Error(`Migration ${name}: ${problems.join("; ")}.`);
  return { name, app: mod.app, phase: mod.phase, about: mod.about.trim(), up: mod.up };
}

/** Every migration in `dir`, in filename order. */
export async function loadMigrations(dir) {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".mjs")).sort();
  const out = [];
  for (const file of files) {
    out.push(checkMigration(file, await import(pathToFileURL(join(dir, file)).href)));
  }
  return out;
}

export function selectMigrations(migrations, { app, phase }) {
  return migrations.filter((m) => m.app === app && m.phase === phase);
}

/** The documents a Sanity mutation touches; null when it picks them by query. */
function mutationIds(mutation) {
  const body = Object.values(mutation)[0] || {};
  const id = body.id ?? body._id;
  return id ? [String(id)] : null;
}

/**
 * This environment's Sanity content (each project has one dataset,
 * "production"), through SANITY_API_TOKEN. A change to a published document,
 * or one picked by query, is noted for the rebuild; drafts are not, since the
 * site reads only published documents.
 */
export function sanityContent({ env, processEnv, site, request = fetch }) {
  const token = String(processEnv.SANITY_API_TOKEN || "").trim();
  if (!token) throw new Error("SANITY_API_TOKEN is not set.");
  const project = env === "production" ? REAL_SANITY_PROJECT_ID : DEV_SANITY_PROJECT_ID;
  const base = `https://${project}.api.sanity.io/v2025-01-01/data`;
  const call = async (path, init = {}) => {
    const res = await request(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Sanity ${res.status}: ${await res.text()}`);
    return res.json();
  };

  return {
    project,
    /** A GROQ query; `params` without their `$`. Drafts too unless `perspective` says. */
    async query(groq, params = {}, { perspective = "raw" } = {}) {
      const search = new URLSearchParams({ query: groq, perspective });
      for (const [name, value] of Object.entries(params)) search.set(`$${name}`, JSON.stringify(value));
      const { result } = await call(`/query/production?${search}`);
      return result;
    },
    /** Upload an image asset; Sanity hands back the existing one when the bytes match. */
    async uploadImage(bytes, { filename, contentType } = {}) {
      const url = new URL(`https://${project}.api.sanity.io/v2025-01-01/assets/images/production`);
      if (filename) url.searchParams.set("filename", filename);
      const res = await request(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType || "application/octet-stream" },
        body: bytes,
      });
      if (!res.ok) throw new Error(`Sanity upload ${res.status}: ${await res.text()}`);
      return (await res.json())?.document ?? null;
    },
    /** Apply mutations in one transaction. */
    async mutate(mutations) {
      if (!mutations.length) return;
      await call("/mutate/production", { method: "POST", body: JSON.stringify({ mutations }) });
      const ids = mutations.map(mutationIds);
      const published = ids.flat().filter((id) => id && !id.startsWith("drafts."));
      if (ids.includes(null)) site?.note(`${project}: documents by query`);
      else if (published.length) site?.note(`${project}: ${published.join(", ")}`);
    },
  };
}

/**
 * Run the selected migrations in order. `d1(role)` opens this env's D1
 * database and `sanity()` its Sanity content (cached, noting into `site`).
 * Stops at the first failure.
 * @returns {Promise<{ rebuild: boolean, changes: string[] }>}
 */
export async function runMigrations(
  migrations,
  { env, processEnv, d1, sanity, site = siteChanges(), log = console.log, dryRun = false },
) {
  for (const migration of migrations) {
    log(`→ ${migration.name}: ${migration.about}${dryRun ? " (dry run)" : ""}`);
    await migration.up({ env, processEnv, d1, sanity, dryRun, log: (line) => log(`    ${line}`) });
  }
  return { rebuild: site.rebuild, changes: site.changes };
}
