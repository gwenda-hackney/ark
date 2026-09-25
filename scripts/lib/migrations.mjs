/**
 * Deploy migrations: changes to data the apps share (Baserow schema, config
 * rows) that a code change depends on. Expand/contract:
 *
 *   pre   runs before the app deploys. Only adds (a column, a table), so the
 *         code still running keeps working next to the new code.
 *   post  runs after the app is live. Removes what only the old code used.
 *
 * Each migration is a file in migrations/ (run in filename order):
 *
 *   export const app = "web";          // whose deploy runs it: "web" | "ops"
 *   export const phase = "pre";        // "pre" | "post"
 *   export const about = "Form Submissions: Edit Link column";
 *   export async function up({ env, database, processEnv, log }) {
 *     const website = await database("website");
 *     log(await website.ensureField("Form Submissions", { name: "Edit Link", type: "url" }));
 *   }
 *
 * Nothing records which migrations ran. Every deploy runs them all, so each
 * one checks the real state first and does nothing when it's already done.
 * A record would lie after `baserow-copy` replaces a copy from production.
 * Delete a migration once it has run in production.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jwtRequest } from "./baserow-clone.mjs";

export const PHASES = ["pre", "post"];
export const APPS = ["web", "ops"];
/** Dev mirrors production; there is no staging environment. */
export const ENVS = ["dev", "production"];

/** Each environment's Baserow databases, as [workspace, database] names. */
export const DATABASES = {
  website: {
    dev: ["Gwenda Dev", "Website"],
    production: ["Gwenda", "Website"],
  },
  ops: {
    dev: ["Gwenda Dev", "Gwenda Ops"],
    production: ["Gwenda", "Gwenda Ops"],
  },
};

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

/**
 * One Baserow database, changed through a user JWT (database tokens can only
 * touch rows). Tables are found by name.
 */
export function baserowDatabase({ apiBase, jwt, databaseId, label, request = jwtRequest }) {
  const call = (path, init) => request(apiBase, jwt, path, init);
  let tables = null;

  async function table(name) {
    tables ??= await call(`/api/database/tables/database/${databaseId}/`);
    const found = (tables || []).find((t) => t.name === name);
    if (!found) throw new Error(`${label}: table "${name}" not found.`);
    return found;
  }

  async function fields(tableName) {
    const { id } = await table(tableName);
    return call(`/api/database/fields/table/${id}/`);
  }

  return {
    label,
    fields,
    /** Add a column unless one with that name exists. Returns what happened. */
    async ensureField(tableName, body) {
      if ((await fields(tableName)).some((f) => f.name === body.name)) return "exists";
      const { id } = await table(tableName);
      try {
        await call(`/api/database/fields/table/${id}/`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (error) {
        // Another deploy (the dev sites deploy side by side) added it first.
        if ((await fields(tableName)).some((f) => f.name === body.name)) return "exists";
        throw error;
      }
      return "created";
    },
    /** Remove a column if it's there. Post-deploy only. */
    async removeField(tableName, fieldName) {
      const field = (await fields(tableName)).find((f) => f.name === fieldName);
      if (!field) return "absent";
      await call(`/api/database/fields/${field.id}/`, { method: "DELETE" });
      return "removed";
    },
  };
}

/** Find an environment's database by workspace + database name. */
export async function openDatabase({ apiBase, jwt, key, env, request = jwtRequest }) {
  const names = DATABASES[key]?.[env];
  if (!names) throw new Error(`There is no ${key} database in ${env}.`);
  const [workspaceName, databaseName] = names;
  const workspaces = await request(apiBase, jwt, "/api/workspaces/");
  const workspace = (workspaces || []).find((ws) => ws.name === workspaceName);
  if (!workspace) throw new Error(`Baserow workspace "${workspaceName}" not found.`);
  const apps = await request(apiBase, jwt, `/api/applications/workspace/${workspace.id}/`);
  const database = (apps || []).find((a) => a.type === "database" && a.name === databaseName);
  if (!database) throw new Error(`Database "${databaseName}" not found in "${workspaceName}".`);
  return baserowDatabase({
    apiBase,
    jwt,
    databaseId: database.id,
    label: `${workspaceName} / ${databaseName}`,
    request,
  });
}

/**
 * Run the selected migrations in order. `database(key)` opens this env's
 * database of that kind (cached). Stops at the first failure.
 */
export async function runMigrations(migrations, { env, processEnv, database, log = console.log }) {
  for (const migration of migrations) {
    log(`→ ${migration.name}: ${migration.about}`);
    await migration.up({ env, processEnv, database, log: (line) => log(`    ${line}`) });
  }
}
