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
 *   export async function up({ env, database, sanity, processEnv, log }) {
 *     const website = await database("website");
 *     log(await website.ensureField("Form Submissions", { name: "Edit Link", type: "url" }));
 *   }
 *
 * `database(key)` changes this environment's Baserow; `sanity()` its Sanity
 * content. Both note changes to what the website build reads (published
 * documents, the tables in SITE_BUILD_TABLES): the site was built before the
 * post migrations, so CI then rebuilds it from the migrated data.
 *
 * Nothing records which migrations ran. Every deploy runs them all, so each
 * one checks the real state first and does nothing when it's already done.
 * A record would lie after `copy-prod-to-dev` replaces a copy from production.
 * Delete a migration once it has run in production.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TABLE_ARTISTS } from "../../shared/baserow.js";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../../shared/sanity-projects.js";
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
  config: {
    dev: ["Gwenda Dev", "Gwenda Config"],
    production: ["Gwenda", "Gwenda Config"],
  },
};

/** Baserow tables the website build reads, by database: changing their rows means a rebuild. */
export const SITE_BUILD_TABLES = { ops: [TABLE_ARTISTS] };

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

/**
 * One Baserow database, changed through a user JWT (database tokens can only
 * touch rows). Tables are found by name.
 */
export function baserowDatabase({ apiBase, jwt, databaseId, label, key, site, request = jwtRequest }) {
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
    /** Every row of a table, by field name. */
    async rows(tableName) {
      const { id } = await table(tableName);
      const out = [];
      for (let page = 1; ; page += 1) {
        const data = await call(`/api/database/rows/table/${id}/?user_field_names=true&size=200&page=${page}`);
        out.push(...(data?.results || []));
        if (!data?.next) return out;
      }
    },
    /** Change rows: `items` are { id, "Field name": value }. */
    async updateRows(tableName, items) {
      if (!items.length) return;
      const { id } = await table(tableName);
      for (let i = 0; i < items.length; i += 100) {
        await call(`/api/database/rows/table/${id}/batch/?user_field_names=true`, {
          method: "PATCH",
          body: JSON.stringify({ items: items.slice(i, i + 100) }),
        });
      }
      if (SITE_BUILD_TABLES[key]?.includes(tableName)) site?.note(`${label}: ${tableName}`);
    },
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
    /** Add a choice to a single-select column unless it has it. Returns what happened. */
    async ensureSelectOption(tableName, fieldName, value) {
      const field = (await fields(tableName)).find((f) => f.name === fieldName);
      if (!field) throw new Error(`${label}: column "${fieldName}" not found in "${tableName}".`);
      const options = field.select_options || [];
      if (options.some((option) => option.value === value)) return "exists";
      await call(`/api/database/fields/${field.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ select_options: [...options, { value, color: "light-blue" }] }),
      });
      return "created";
    },
    /**
     * Add a table unless one with that name exists: just its primary column
     * (`primary`), no rows. Returns what happened.
     */
    async ensureTable(tableName, primary) {
      tables ??= await call(`/api/database/tables/database/${databaseId}/`);
      if (tables.some((t) => t.name === tableName)) return "exists";
      const created = await call(`/api/database/tables/database/${databaseId}/`, {
        method: "POST",
        body: JSON.stringify({ name: tableName, data: [[primary]], first_row_header: true }),
      });
      tables = [...tables, created];
      return "created";
    },
    /** Remove a whole table, rows and all, if it's there. Post-deploy only. */
    async removeTable(tableName) {
      tables ??= await call(`/api/database/tables/database/${databaseId}/`);
      const found = tables.find((t) => t.name === tableName);
      if (!found) return "absent";
      await call(`/api/database/tables/${found.id}/`, { method: "DELETE" });
      tables = tables.filter((t) => t.id !== found.id);
      return "removed";
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

/**
 * Find an environment's database by workspace + database name (needs a user
 * JWT; database tokens cannot read names). Ids are never configured.
 * @returns {Promise<{ workspaceId: string, databaseId: string, label: string }>}
 */
export async function findDatabase({ apiBase, jwt, key, env, request = jwtRequest }) {
  const names = DATABASES[key]?.[env];
  if (!names) throw new Error(`There is no ${key} database in ${env}.`);
  const [workspaceName, databaseName] = names;
  const workspaces = await request(apiBase, jwt, "/api/workspaces/");
  const workspace = (workspaces || []).find((ws) => ws.name === workspaceName);
  if (!workspace) throw new Error(`Baserow workspace "${workspaceName}" not found.`);
  const apps = await request(apiBase, jwt, `/api/applications/workspace/${workspace.id}/`);
  const database = (apps || []).find((a) => a.type === "database" && a.name === databaseName);
  if (!database) throw new Error(`Database "${databaseName}" not found in "${workspaceName}".`);
  return {
    workspaceId: String(workspace.id),
    databaseId: String(database.id),
    label: `${workspaceName} / ${databaseName}`,
  };
}

/** Open an environment's database by name for a migration. */
export async function openDatabase({ apiBase, jwt, key, env, site, request = jwtRequest }) {
  const { databaseId, label } = await findDatabase({ apiBase, jwt, key, env, request });
  return baserowDatabase({ apiBase, jwt, databaseId, label, key, site, request });
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
 * Run the selected migrations in order. `database(key)` opens this env's
 * database of that kind and `sanity()` its Sanity content (both cached, both
 * noting into `site`). Stops at the first failure.
 * @returns {Promise<{ rebuild: boolean, changes: string[] }>}
 */
export async function runMigrations(
  migrations,
  { env, processEnv, database, sanity, site = siteChanges(), log = console.log },
) {
  for (const migration of migrations) {
    log(`→ ${migration.name}: ${migration.about}`);
    await migration.up({ env, processEnv, database, sanity, log: (line) => log(`    ${line}`) });
  }
  return { rebuild: site.rebuild, changes: site.changes };
}
