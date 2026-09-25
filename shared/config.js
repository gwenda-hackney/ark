/**
 * The one way to read configuration. Every app and script imports from here,
 * never from config-db.js (shared/config.test.js enforces it).
 *
 * Where a value comes from, in order:
 *   1. A developer's machine: settings with `local` read that developer's own
 *      value from .env. `required` ones must be set; `npm run env:pull` writes
 *      a placeholder so a fresh machine fails loudly until the developer fills
 *      it in (e.g. their email for form notifications).
 *   2. The Gwenda Config database: this environment's row (dev or production;
 *      a developer's machine reads dev), else the "all" row.
 *
 * Machine state (build snapshots, scheduler state, secret fingerprints) also
 * lives in the config database; readState/writeState are its only doors.
 */
import {
  CONFIG_CACHE_TTL_MS,
  CONFIG_DATABASE_NAME,
  CONFIG_ENVS,
  CONFIG_TABLE_NAME,
  deleteConfigEnvRows,
  deleteConfigRows,
  environmentOf,
  getConfigValueFor,
  getConfigValues as rowValues,
  isLocalMachine,
  listConfigRows,
  resetConfigCacheForTests,
  rowScope,
  setConfigValue,
  setConfigValueFor,
  valuesFromRows,
} from "./config-db.js";

export {
  CONFIG_CACHE_TTL_MS,
  CONFIG_DATABASE_NAME,
  CONFIG_ENVS,
  CONFIG_TABLE_NAME,
  environmentOf,
  isLocalMachine,
  resetConfigCacheForTests,
  valuesFromRows,
};

/**
 * Settings that code no longer reads. Their rows are removed after a deploy
 * (migrations/config-retired-settings.mjs, run by CI once the new code is live),
 * never before: the code still running may read them until then.
 */
export const RETIRED_SETTINGS = ["web.origin", "sanity.dataset", "web.pages_secrets_fingerprint"];

/** Remove retired settings' rows. Post-deploy only. */
export async function removeRetiredSettings(env) {
  const removed = {};
  for (const key of RETIRED_SETTINGS) removed[key] = await deleteConfigRows(env, key);
  return removed;
}

/** Remove every row of an Env no code uses any more. Post-deploy only. */
export async function removeRetiredEnv(env, envName) {
  return deleteConfigEnvRows(env, envName);
}

/** Written by env:pull for local-only settings a developer must fill in. */
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
    `${entry.local.env} is not set in .env (${entry.local.hint}). ` +
      `This machine needs it for ${key}; replace ${LOCAL_PLACEHOLDER} with your value.`,
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
  await setConfigValue(env, service, key, value);
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

/** Local-only settings, for env:pull placeholders and the env template. */
export function localSettingNames() {
  return Object.values(SETTINGS)
    .filter((entry) => entry.local)
    .map((entry) => ({ env: entry.local.env, hint: entry.local.hint }));
}

/** Machine state row (not a setting): exact Env + Service, no fallback. */
export async function readState(env, service, key, scope) {
  return getConfigValueFor(env, service, key, scope);
}

export async function writeState(env, service, key, scope, value) {
  return setConfigValueFor(env, service, key, scope, value);
}

/** Keys written by code (build snapshots, scheduler state), not settings. */
const STATE_KEY = /^site\.|fingerprint$/;

function rowText(value) {
  if (value && typeof value === "object" && value.value != null) return String(value.value).trim();
  return String(value ?? "").trim();
}

/**
 * Every setting for every environment, and where each value comes from, for
 * ops Developer tools → Settings. Also rows no setting knows about, and the
 * machine-state rows (by name and size only).
 */
export async function describeSettings(env) {
  const rows = await listConfigRows(env);
  const winner = (key, service, envName) => {
    let best = null;
    for (const row of rows) {
      if (rowText(row.Name) !== key) continue;
      const rowEnv = rowScope(row.Env);
      const rowService = rowScope(row.Service);
      if (rowEnv !== "all" && rowEnv !== envName) continue;
      if (rowService !== "all" && rowService !== service && service !== "all") continue;
      const score = (rowEnv === envName ? 2 : 0) + (rowService === service ? 1 : 0);
      if (!best || score > best.score) best = { score, row, rowEnv };
    }
    return best
      ? { value: rowText(best.row.Value), from: best.rowEnv === "all" ? "config: all" : `config: ${best.rowEnv}` }
      : { value: "", from: "not set" };
  };
  const machine = isLocalMachine(env);
  const settings = Object.entries(SETTINGS).map(([key, entry]) => {
    const values = {};
    for (const envName of CONFIG_ENVS) {
      values[envName] = winner(key, entry.service, envName);
    }
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
  for (const row of rows) {
    const key = rowText(row.Name);
    if (!key || known.has(key)) continue;
    const item = { key, env: rowScope(row.Env), service: rowScope(row.Service) };
    if (STATE_KEY.test(key)) state.push({ ...item, size: rowText(row.Value).length });
    else unknown.push({ ...item, value: rowText(row.Value) });
  }
  return {
    environments: [...CONFIG_ENVS],
    current: environmentOf(env),
    onMachine: machine,
    settings,
    unknown,
    state,
  };
}
