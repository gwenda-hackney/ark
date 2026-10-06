/**
 * The config domain (#186): records and the rules for picking a value, with
 * no storage in sight. A config record is one stored value:
 *
 *   { id, name, value, env, service }
 *     name     dotted key, e.g. forms.notify_email
 *     value    string
 *     env      all | dev | production, or a site's name (preview) for machine state
 *     service  all | ops | web
 *
 * For a given env + service the most specific record wins: Env beats Service
 * beats `all`. One record per name + env + service.
 *
 * No imports, so anything (d1-env.js included) can use it without a cycle.
 */

/** How long a runtime keeps the config it read (per isolate / process). */
export const CONFIG_CACHE_TTL_MS = 60_000;

/** What a copy (exportAll / importAll) calls the records. */
export const CONFIG_COLLECTION = "config_values";

/**
 * The environment a runtime belongs to (its config Env): dev or production,
 * from SITE_ENV. Prod's preview runs as production. A developer's machine
 * (SITE_ENV=local) is dev.
 */
export function environmentOf(env = {}) {
  const raw = String(env.SITE_ENV || "")
    .trim()
    .toLowerCase();
  if (raw === "local" || raw === "development" || raw === "dev") return "dev";
  if (raw === "production" || raw === "prod") return "production";
  if (!raw) {
    // No default: code run outside a deployment without SITE_ENV used to read
    // production settings with whatever database keys it had, and on
    // 2026-09-26 wrote dev nights into the production calendar.
    throw new Error("SITE_ENV is not set. Use production, dev or local.");
  }
  return raw;
}

/**
 * A developer's machine (npm run ops:dev / web:dev set SITE_ENV=local): dev
 * settings plus that developer's own values from .env. Hosted dev is SITE_ENV=dev.
 */
export function isLocalMachine(env = {}) {
  const raw = String(env.SITE_ENV || "")
    .trim()
    .toLowerCase();
  return raw === "local" || raw === "development";
}

/** An Env or Service value, lowercased ("all" when blank). */
export function configScope(value) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() || "all"
  );
}

/** Fields as a record is stored: trimmed name, scopes lowercased, value a string. */
export function configRecord({ id, name, value, env, service }) {
  return {
    id,
    name: String(name ?? "").trim(),
    value: String(value ?? ""),
    env: configScope(env),
    service: configScope(service),
  };
}

/** The same name + env + service: the one record a set writes. */
export function sameSlot(a, b) {
  return a.name === b.name && a.env === b.env && a.service === b.service;
}

function specificity(record, envName, service) {
  if (record.env !== "all" && record.env !== envName) return -1;
  if (record.service !== "all" && record.service !== service) return -1;
  return (
    (record.env === envName ? 2 : 0) + (record.service === service ? 1 : 0)
  );
}

/**
 * Collapse records into key → value for one env + service. Of equally
 * specific records, the first (lowest id) wins.
 */
export function valuesFromRecords(records, envName, service) {
  const best = new Map();
  for (const record of records || []) {
    if (!record.name) continue;
    const score = specificity(record, envName, service);
    if (score < 0) continue;
    const prev = best.get(record.name);
    if (!prev || score > prev.score)
      best.set(record.name, { score, value: String(record.value).trim() });
  }
  return Object.fromEntries(
    [...best].map(([key, entry]) => [key, entry.value]),
  );
}
