/**
 * The one way to read configuration. Every app and script imports from here,
 * never from config-db.js (shared/config.test.js enforces it).
 *
 * Where a value comes from, in order:
 *   1. A developer's machine: settings with `local` read that developer's own
 *      value from .env. `required` ones must be set, so a fresh machine fails
 *      loudly until the developer fills it in (e.g. their email for form
 *      notifications; .env.example lists them).
 *   2. This environment's Gwenda Config database (production's in the Gwenda
 *      workspace, dev's in Gwenda Dev; a developer's machine reads dev's): the
 *      environment's row, else the "all" row.
 *
 * Machine state (build snapshots, scheduler state, secret fingerprints) also
 * lives in the config database; readState/writeState are its only doors.
 *
 * The database is Baserow or D1, whichever `store:config` names (#127): all
 * storage goes through the config repository (config-repository.js).
 */
import {
  CONFIG_DATABASE_NAME,
  CONFIG_ENVS,
  CONFIG_TABLE_NAME,
  resetConfigCacheForTests as resetBaserowConfigCache,
  valuesFromRows,
} from "./config-db.js";
import { resetD1ConfigCacheForTests } from "./config-adapters/d1-config.js";
import { CONFIG_CACHE_TTL_MS, environmentOf, isLocalMachine, valuesFromRecords } from "./config-model.js";
import { configRepository } from "./config-repository.js";

export {
  CONFIG_CACHE_TTL_MS,
  CONFIG_DATABASE_NAME,
  CONFIG_ENVS,
  CONFIG_TABLE_NAME,
  environmentOf,
  isLocalMachine,
  valuesFromRows,
};

export function resetConfigCacheForTests() {
  resetBaserowConfigCache();
  resetD1ConfigCacheForTests();
}

/** Every config record this runtime's environment and `service` can see, collapsed to key → value. */
async function rowValues(env, service) {
  return valuesFromRecords(await configRepository(env).list(), environmentOf(env), service);
}

/**
 * Settings that code no longer reads. Their rows are removed after a deploy
 * (migrations/config-retired-settings.mjs, run by CI once the new code is live),
 * never before: the code still running may read them until then.
 */
export const RETIRED_SETTINGS = ["site.build_snapshot.dev", "site.auto_update.dev"];

/** Remove retired settings' rows. Post-deploy only. */
export async function removeRetiredSettings(env) {
  const repo = configRepository(env);
  const removed = {};
  for (const key of RETIRED_SETTINGS) removed[key] = await repo.removeNamed(key);
  return removed;
}

/** Remove every row of an Env no code uses any more. Post-deploy only. */
export async function removeRetiredEnv(env, envName) {
  return configRepository(env).removeEnv(envName);
}

/** A placeholder that counts as unset (older .env files carry it). */
export const LOCAL_PLACEHOLDER = "SET-ME";

/**
 * Every setting. `service` is the config Service column ("all" = both apps).
 * `local`: on a developer's machine, read `env` from .env instead.
 */
export const SETTINGS = {
  "sanity.project_id": { service: "all", about: "Sanity project (dev: Gwenda Dev)" },
  "site_deploy.webhook_url": { service: "ops", about: "Deploy webhook Worker" },
  "google.oauth_client_id": { service: "ops", about: "Google sign-in client for ops" },
  "google.calendar_id": { service: "ops", about: "Calendar that ops keeps event nights on" },
  "google.drive_events_folder_id": { service: "ops", about: "Drive folder for event photos" },
  "tasks.role.social": { service: "ops", about: "Who gets social-post tasks" },
  "clickup.events_list_id": { service: "ops", about: "ClickUp list for event tasks" },
  "ops.admin_emails": { service: "ops", about: "Who sees ops developer tools" },
  "lightspeed.archive_skus": { service: "ops", about: "POS SKUs ops treats as archived" },
  "pour_target.cocktail": { service: "ops", about: "Pour-cost target, cocktails (%)" },
  "pour_target.pour": { service: "ops", about: "Pour-cost target, pours (%)" },
  "pour_target.beer": { service: "ops", about: "Pour-cost target, beer (%)" },
  "pour_target.packaged": { service: "ops", about: "Pour-cost target, packaged (%)" },
  "forms.notify_email": {
    service: "web",
    about: "Where form notifications go outside prod (prod: each form's own address)",
    local: { env: "FORMS_NOTIFY_EMAIL", required: true, hint: "your email address" },
  },
};

/** Thrown when a required setting can't be resolved. */
export class ConfigError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

function localValue(env, entry) {
  const value = String(env?.[entry.local.env] ?? "").trim();
  return value && value !== LOCAL_PLACEHOLDER ? value : "";
}

function missingLocal(entry, key) {
  return new ConfigError(
    `${entry.local.env} is not set (${entry.local.hint}). This machine needs it for ${key}. ` +
      "Set your git email (git config user.email you@example.com) or put it in .env.",
  );
}

/** A developer's local values, which win over config rows on their machine. */
function overrides(env, service) {
  const out = {};
  if (!isLocalMachine(env)) return out;
  for (const [key, entry] of Object.entries(SETTINGS)) {
    if (entry.service !== service && entry.service !== "all") continue;
    if (!entry.local) continue;
    const value = localValue(env, entry);
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Every setting for one service in this runtime, as key → value. Config rows,
 * then local values on top. Throws when the database can't be read.
 */
export async function getSettings(env, service) {
  return { ...(await rowValues(env, service)), ...overrides(env, service) };
}

/**
 * One setting. "" when it has no value. Throws when the database can't be
 * read, or a required local value is missing on a developer's machine.
 */
export async function getSetting(env, service, key) {
  const entry = SETTINGS[key];
  if (entry?.local && isLocalMachine(env)) {
    const value = localValue(env, entry);
    if (value) return value;
    if (entry.local.required) throw missingLocal(entry, key);
  }
  return String((await rowValues(env, service))[key] || "").trim();
}

/**
 * Like getSetting, but "" instead of throwing when the database is
 * unavailable (callers that have a safe built-in default).
 */
export async function getSettingOrEmpty(env, service, key) {
  try {
    return await getSetting(env, service, key);
  } catch (error) {
    if (error?.status === 503 && !(error instanceof ConfigError)) return "";
    throw error;
  }
}

/** Write this environment's row for a setting (e.g. pour targets from /config). */
export async function setSetting(env, service, key, value) {
  await configRepository(env).set({ name: key, env: environmentOf(env), service, value });
}

/**
 * Local-only settings this machine is missing, for dev startup checks.
 * Empty off a developer's machine.
 */
export function missingLocalSettings(env = process.env, { services = ["ops", "web"] } = {}) {
  if (!isLocalMachine(env)) return [];
  return Object.entries(SETTINGS)
    .filter(([, entry]) => entry.local?.required && services.includes(entry.service))
    .filter(([, entry]) => !localValue(env, entry))
    .map(([key, entry]) => ({ key, env: entry.local.env, hint: entry.local.hint }));
}

/** Machine state row (not a setting): exact Env + Service, no fallback. */
export async function readState(env, service, key, scope) {
  const record = await configRepository(env).find({ name: key, env: scope, service });
  return record ? record.value.trim() : "";
}

export async function writeState(env, service, key, scope, value) {
  await configRepository(env).set({ name: key, env: scope, service, value });
}

/** Keys written by code (build snapshots, scheduler state), not settings. */
const STATE_KEY = /^site\.|fingerprint$/;

/**
 * Every setting in this environment, and where each value comes from, for
 * ops Developer tools → Settings. Each environment reads only its own config
 * database, so the developer's machine column (dev rows) is shown in dev only. Also rows no setting knows about, and the
 * machine-state rows (by name and size only).
 */
export async function describeSettings(env) {
  const records = await configRepository(env).list();
  const winner = (key, service, envName) => {
    let best = null;
    for (const record of records) {
      if (record.name !== key) continue;
      if (record.env !== "all" && record.env !== envName) continue;
      if (record.service !== "all" && record.service !== service && service !== "all") continue;
      const score = (record.env === envName ? 2 : 0) + (record.service === service ? 1 : 0);
      if (!best || score > best.score) best = { score, record };
    }
    return best
      ? {
          value: best.record.value.trim(),
          from: best.record.env === "all" ? "config: all" : `config: ${best.record.env}`,
        }
      : { value: "", from: "not set" };
  };
  const machine = isLocalMachine(env);
  const current = environmentOf(env);
  const settings = Object.entries(SETTINGS).map(([key, entry]) => {
    const values = { [current]: winner(key, entry.service, current) };
    const local = entry.local
      ? {
          env: entry.local.env,
          required: Boolean(entry.local.required),
          hint: entry.local.hint,
          // Only a developer's own machine can show its value.
          value: machine ? localValue(env, entry) : null,
        }
      : null;
    return {
      key,
      service: entry.service,
      about: entry.about || "",
      values,
      machine: local
        ? { value: local.value, from: `.env ${local.env}` }
        : { ...winner(key, entry.service, "dev"), from: `dev ${winner(key, entry.service, "dev").from}` },
      local,
    };
  });
  const known = new Set(Object.keys(SETTINGS));
  const unknown = [];
  const state = [];
  for (const record of records) {
    const key = record.name;
    if (!key || known.has(key)) continue;
    const item = { key, env: record.env, service: record.service };
    const value = record.value.trim();
    if (STATE_KEY.test(key)) state.push({ ...item, size: value.length });
    else unknown.push({ ...item, value });
  }
  return {
    environments: [current],
    current,
    onMachine: machine,
    settings,
    unknown,
    state,
  };
}
