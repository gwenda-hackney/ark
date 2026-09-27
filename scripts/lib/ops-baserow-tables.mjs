/**
 * Resolve Ops Baserow table ids by name for local seed/migrate scripts.
 * Requires BASEROW_API_KEY in the environment; the token picks the database.
 */
import { resolveOpsTableIds } from "../../shared/baserow.js";

export async function requireOpsTables(env = process.env) {
  const apiKey = env.BASEROW_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BASEROW_API_KEY is required.");
  }
  return resolveOpsTableIds(env);
}
