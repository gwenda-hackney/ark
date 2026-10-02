/**
 * Standing migration: remove config rows no code reads any more
 * (shared/config.js RETIRED_SETTINGS). After the ops deploy, never before:
 * the ops still running may read them until then. Safe to re-run.
 */
import { RETIRED_SETTINGS, removeRetiredSettings } from "../shared/config.js";

export const app = "ops";
export const phase = "post";
export const about = "Config: remove retired settings";

export async function up({ processEnv, log }) {
  const removed = await removeRetiredSettings(processEnv);
  for (const key of RETIRED_SETTINGS) {
    log(removed[key] ? `${key}: removed ${removed[key]} row(s)` : `${key}: nothing to remove`);
  }
}
