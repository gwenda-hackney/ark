/**
 * Baserow provider for the production → dev copy (./database.mjs). Each
 * database is copied by its clone script in its own process: the scripts load
 * different app envs (ops and web read BASEROW_API_KEY as different tokens)
 * and still run on their own (`npm run dev:refresh:baserow-*`).
 *
 * The scripts find both databases by name (scripts/lib/migrations.mjs
 * DATABASES), keep the copy's database and tables, and wipe and re-copy its
 * rows (--force). File values (photos) are not copied.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const CLONE_SCRIPTS = {
  ops: "clone-baserow-ops-db.mjs",
  website: "clone-baserow-web-db.mjs",
};

/** The command that copies one database. */
export function baserowCopyCommand(database, { dryRun = false } = {}) {
  const script = CLONE_SCRIPTS[database];
  if (!script) throw new Error(`Baserow has no "${database}" database to copy.`);
  return [resolve(SCRIPTS, script), "--force", ...(dryRun ? ["--dry-run"] : [])];
}

export const baserow = {
  id: "baserow",
  label: "Baserow",
  databases: Object.keys(CLONE_SCRIPTS),
  /** @param {string} database @param {{ dryRun?: boolean, run?: typeof spawnSync }} [opts] */
  copy(database, { dryRun = false, run = spawnSync } = {}) {
    const result = run(process.execPath, baserowCopyCommand(database, { dryRun }), {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`Baserow copy of the ${database} database failed.`);
    }
  },
};
