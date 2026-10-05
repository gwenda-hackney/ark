/**
 * The D1 database for a role in this runtime's environment (#127).
 *
 * In a Worker or Pages Function, that is the binding (env.OPS_DB, …): code
 * can only reach its own account's database. Elsewhere (Node scripts, the
 * website build in CI, astro dev) it is the REST API with this environment's
 * Cloudflare token, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, which the
 * env wrappers already set per environment.
 */
import { environmentOf } from "./config-db.js";
import { d1Http } from "./d1-http.js";
import { D1_BINDINGS, D1_DATABASES } from "./d1-databases.js";

/**
 * @param {Record<string, any>} env
 * @param {"ops" | "website" | "config"} role
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function databaseFor(env, role, { fetchImpl } = {}) {
  const binding = D1_BINDINGS[role];
  if (!binding) throw new Error(`Unknown D1 database role "${role}".`);
  if (env?.[binding]) return env[binding];

  const environment = environmentOf(env);
  const database = D1_DATABASES[environment]?.[role];
  if (!database?.id) {
    throw new Error(
      `No ${binding} binding, and no id for the ${environment} ${role} database. Run npm run setup:d1.`,
    );
  }
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!token || !accountId) {
    throw new Error(
      `No ${binding} binding; reaching D1 over the API needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.`,
    );
  }
  return d1Http({
    accountId,
    databaseId: database.id,
    token,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
