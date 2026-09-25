/**
 * The old preview site, gwenda-staging, read its settings from Env=staging,
 * and the preview's machine state (site.build_snapshot, site.auto_update)
 * was stored under "staging". Prod's preview now runs as production and its
 * state is stored under "preview", so nothing reads those rows. Safe to re-run.
 */
import { removeRetiredEnv } from "../shared/config.js";

export const app = "web";
export const phase = "post";
export const about = "Config: remove the old preview's rows (Env=staging)";

export async function up({ env, processEnv, log }) {
  // One config database serves every environment: only once the production
  // website and ops no longer run code that reads them.
  if (env !== "production") return log("production only");
  log(`removed ${await removeRetiredEnv(processEnv, "staging")} row(s)`);
}
