/**
 * D1 schema migrations on deploy (#191): db/<role>/migrations/*.sql, applied
 * by `wrangler d1 migrations apply`, which records what ran in each database.
 * Database names and ids come from shared/d1-databases.js; the wrangler
 * config is written per run, so no toml has to repeat them.
 *
 * A push to release deploys ops, the website and the Workers at once, so two
 * jobs can apply the same migration together. The loser fails (for example
 * "duplicate column"), so a failed apply is retried once: by then the
 * migration is recorded and the retry does nothing.
 *
 * Local runs (ops:dev) apply the same migrations to the throwaway local
 * databases `wrangler pages dev` opens: localD1MigrationPlan reads the app's
 * own wrangler.toml, because local state is keyed by the database_id it binds.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  D1_BINDINGS,
  D1_DATABASES,
  D1_ROLES,
} from "../../shared/d1-databases.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WRANGLER = resolve(ROOT, "node_modules/.bin/wrangler");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** What to do for each role: apply, or skip because the database doesn't exist yet. */
export function d1MigrationPlan(
  env,
  roles = D1_ROLES,
  databases = D1_DATABASES,
) {
  const byRole = databases[env];
  if (!byRole)
    throw new Error(`Unknown environment "${env}". Use dev or production.`);
  return roles.map((role) => {
    const database = byRole[role];
    if (!database) throw new Error(`Unknown D1 database role "${role}".`);
    return database.id
      ? {
          role,
          name: database.name,
          id: database.id,
          migrationsDir: join(ROOT, "db", role, "migrations"),
        }
      : {
          role,
          name: database.name,
          skip: "not created yet (npm run setup:d1, #190)",
        };
  });
}

/**
 * The D1 databases an app's wrangler.toml binds, as a plan for local
 * migrations. Unknown bindings are ignored.
 * @param {string} toml
 */
export function localD1MigrationPlan(toml) {
  const roleOf = Object.fromEntries(
    Object.entries(D1_BINDINGS).map(([role, binding]) => [binding, role]),
  );
  const blocks = String(toml)
    .split(/^\[\[d1_databases\]\]\s*$/m)
    .slice(1);
  return blocks.flatMap((block) => {
    const value = (key) =>
      new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(block)?.[1] ?? "";
    const role = roleOf[value("binding")];
    const id = value("database_id");
    if (!role || !id) return [];
    return [
      {
        role,
        name: value("database_name"),
        id,
        migrationsDir: join(ROOT, "db", role, "migrations"),
      },
    ];
  });
}

/** A wrangler config naming only this database. */
export function wranglerConfig({ role, name, id, migrationsDir }) {
  return [
    `name = "gwenda-d1-migrations"`,
    `compatibility_date = "2026-07-01"`,
    "",
    "[[d1_databases]]",
    `binding = "${D1_BINDINGS[role]}"`,
    `database_name = "${name}"`,
    `database_id = "${id}"`,
    `migrations_dir = ${JSON.stringify(migrationsDir)}`,
    "",
  ].join("\n");
}

function wrangler(
  args,
  { configPath, env = process.env, run = spawnSync, persistTo = "" },
) {
  const target = persistTo
    ? ["--local", "--persist-to", persistTo]
    : ["--remote"];
  const result = run(WRANGLER, [...args, ...target, "-c", configPath], {
    stdio: "inherit",
    env: { ...env, CI: "true" },
  });
  return result.status === 0;
}

/**
 * Apply (or, with dryRun, list) pending migrations for each planned database.
 * With persistTo, to the local databases kept there instead of the remote ones.
 * @returns {Promise<{ role: string, status: "applied" | "listed" | "skipped" }[]>}
 */
export async function applyD1Migrations(
  plan,
  {
    dryRun = false,
    env = process.env,
    run = spawnSync,
    wait = sleep,
    log = console.log,
    persistTo = "",
  } = {},
) {
  const where = persistTo ? " (local)" : "";
  const results = [];
  for (const item of plan) {
    if (item.skip) {
      log(`D1 ${item.name}: skipped, ${item.skip}.`);
      results.push({ role: item.role, status: "skipped" });
      continue;
    }
    const dir = mkdtempSync(join(tmpdir(), "gwenda-d1-"));
    try {
      const configPath = join(dir, "wrangler.toml");
      writeFileSync(configPath, wranglerConfig(item));
      const args = ["d1", "migrations", dryRun ? "list" : "apply", item.name];
      log(
        `D1 ${item.name}${where}: ${dryRun ? "pending migrations" : "applying migrations"}…`,
      );
      let ok = wrangler(args, { configPath, env, run, persistTo });
      if (!ok && !dryRun && !persistTo) {
        log(
          `D1 ${item.name}: apply failed; retrying once in case another deploy got there first…`,
        );
        await wait(10_000);
        ok = wrangler(args, { configPath, env, run, persistTo });
      }
      if (!ok) throw new Error(`D1 migrations for ${item.name} failed.`);
      results.push({ role: item.role, status: dryRun ? "listed" : "applied" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return results;
}
