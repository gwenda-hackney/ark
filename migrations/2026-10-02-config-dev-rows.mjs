/**
 * Dev has its own config database (Gwenda Dev / Gwenda Config), so the
 * production database's Env=dev rows are read by nothing. Removed after the
 * ops deploy, in production only. Safe to re-run.
 */
import { removeRetiredEnv } from "../shared/config.js";

export const app = "ops";
export const phase = "post";
export const about = "Config: remove dev's rows from the production database (Env=dev)";

export async function up({ env, processEnv, log }) {
  if (env !== "production") return log("production only");
  log(`removed ${await removeRetiredEnv(processEnv, "dev")} row(s)`);
}
