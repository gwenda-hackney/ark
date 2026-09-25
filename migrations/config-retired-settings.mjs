/**
 * Standing migration: remove config rows no code reads any more
 * (shared/config.js RETIRED_SETTINGS). After the ops deploy, never before:
 * the ops still running may read them until then. Safe to re-run.
 */
import { RETIRED_SETTINGS, removeRetiredSettings } from "../shared/config.js";

export const app = "ops";
export const phase = "post";
export const about = "Config: remove retired settings";

export async function up({ env, processEnv, log }) {
  // One config database serves every environment, and this removes the rows
  // for all of them: only once the production ops no longer reads them.
  if (env !== "production") return log("production only");
  const removed = await removeRetiredSettings(processEnv);
  for (const key of RETIRED_SETTINGS) {
    log(removed[key] ? `${key}: removed ${removed[key]} row(s)` : `${key}: nothing to remove`);
  }
}
