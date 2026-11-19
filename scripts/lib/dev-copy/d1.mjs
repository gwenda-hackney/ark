/**
 * D1 provider for the production → dev copy (./database.mjs). Each database
 * is copied feature by feature with data-move (scripts/data-move.mjs), D1
 * production → D1 dev, each in its own process:
 *
 *   node scripts/data-move.mjs --feature <f> --from d1:production --to d1:dev --write
 *
 * A move replaces the feature's records in dev with production's, checks
 * the copy record for record, and leaves behind what points at production's
 * own things (features.mjs `detach`). A dry run reads production and imports
 * into a local SQLite copy instead: nothing in dev changes. Config is not
 * copied: each environment keeps its own settings.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURES } from "../data-move/features.mjs";

const DATA_MOVE = resolve(dirname(fileURLToPath(import.meta.url)), "../../data-move.mjs");

/** The databases the copy offers, in copy order. */
const DATABASES = ["ops", "website"];

/** The features kept in one database, in the registry's order. */
export function featuresIn(database, features = FEATURES) {
  if (!DATABASES.includes(database)) throw new Error(`D1 has no "${database}" database to copy.`);
  return Object.entries(features)
    .filter(([, feature]) => feature.role === database)
    .map(([name]) => name);
}

/** The data-move command that copies one feature. */
export function d1CopyCommand(feature, { dryRun = false } = {}) {
  return [DATA_MOVE, "--feature", feature, "--from", "d1:production", "--to", "d1:dev", ...(dryRun ? [] : ["--write"])];
}

export const d1 = {
  id: "d1",
  label: "D1",
  databases: DATABASES,
  /** @param {string} database @param {{ dryRun?: boolean, run?: typeof spawnSync }} [opts] */
  copy(database, { dryRun = false, run = spawnSync } = {}) {
    const failed = [];
    for (const feature of featuresIn(database)) {
      const result = run(process.execPath, d1CopyCommand(feature, { dryRun }), { stdio: "inherit" });
      if (result.status !== 0) failed.push(feature);
    }
    if (failed.length) throw new Error(`D1 copy of the ${database} database failed: ${failed.join(", ")}.`);
  },
};
