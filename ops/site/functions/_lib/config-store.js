/**
 * Runtime non-secret config from Baserow "App Config".
 * Bootstrap still needs BASEROW_API_KEY (+ optional database id / SITE_ENV).
 * Secrets never belong in this table.
 */
import {
  OPS_DATABASE_NAME,
  OPS_PRODUCTION_DATABASE_ID,
  createRow,
  listAllRows,
  opsDatabaseId,
  resolveConfigTableId,
  updateRow,
} from "./baserow.js";

export const CONFIG_CACHE_TTL_MS = 60_000;

export const POUR_TARGET_KEYS = {
  cocktail: "pour_target.cocktail",
  pour: "pour_target.pour",
  beer: "pour_target.beer",
  packaged: "pour_target.packaged",
};

/** Defaults match menu-app drink-type model (percent of selling price). */
export const DEFAULT_POUR_TARGETS = {
  cocktail: 20,
  pour: 18,
  beer: 22,
  packaged: 25,
};

/** Non-secret ops settings (App Config Name column). */
export const OPS_CONFIG_KEYS = {
  sanityProjectId: "sanity.project_id",
  sanityDataset: "sanity.dataset",
  siteDeployWebhookUrl: "site_deploy.webhook_url",
  googleOauthClientId: "google.oauth_client_id",
};

export const DEFAULT_SANITY_PROJECT_ID = "pn5yjro6";

const DRINK_TYPES = Object.keys(POUR_TARGET_KEYS);

let cache = { key: "", at: 0, rows: null };

export function resetConfigCacheForTests() {
  cache = { key: "", at: 0, rows: null };
}

function bustConfigCache() {
  cache = { key: "", at: 0, rows: null };
}

export function siteEnvName(env = {}) {
  const raw = String(env.SITE_ENV || env.PUBLIC_IS_STAGING || "")
    .trim()
    .toLowerCase();
  if (raw === "true" || raw === "staging") return "staging";
  if (raw === "local" || raw === "development" || raw === "dev") return "local";
  if (raw === "production" || raw === "prod") return "production";
  return raw || "production";
}

/** Human labels for shell chrome (which Baserow world this request hits). */
export function opsConnectionInfo(env = {}) {
  const siteEnv = siteEnvName(env);
  const databaseId = opsDatabaseId(env) || null;
  const isProductionDb = databaseId === OPS_PRODUCTION_DATABASE_ID;
  const envLabel =
    siteEnv === "local"
      ? "Local"
      : siteEnv === "staging"
        ? "Staging"
        : siteEnv === "production"
          ? "Production"
          : siteEnv;
  const databaseLabel = !databaseId
    ? "Baserow Ops (auto)"
    : isProductionDb
      ? OPS_DATABASE_NAME
      : `${OPS_DATABASE_NAME} (dev)`;

  let risk = null;
  if (siteEnv !== "production" && isProductionDb) risk = "nonprod_on_production_db";
  else if (siteEnv === "production" && databaseId && !isProductionDb) {
    risk = "production_on_nonprod_db";
  }

  return {
    siteEnv,
    envLabel,
    databaseId,
    databaseLabel,
    isProductionDb,
    risk,
  };
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) {
    return String(value.value).trim();
  }
  return String(value).trim();
}

function selectValue(value) {
  return text(value).toLowerCase() || "all";
}

function specificityScore(row, envName, service) {
  const rowEnv = selectValue(row.Env);
  const rowService = selectValue(row.Service);
  if (rowEnv !== "all" && rowEnv !== envName) return -1;
  if (rowService !== "all" && service && rowService !== service) return -1;
  let score = 0;
  if (rowEnv === envName) score += 2;
  if (service && rowService === service) score += 1;
  return score;
}

/**
 * Collapse App Config rows into a flat key → value map for this env/service.
 * More specific Env/Service wins over `all`.
 */
export function valuesFromRows(rows, envName, service = "ops") {
  const best = new Map();
  for (const row of rows || []) {
    const key = text(row.Name) || text(row.Key);
    if (!key) continue;
    const score = specificityScore(row, envName, service);
    if (score < 0) continue;
    const prev = best.get(key);
    if (!prev || score > prev.score) {
      best.set(key, { score, value: text(row.Value), row });
    }
  }
  const values = {};
  for (const [key, entry] of best) values[key] = entry.value;
  return values;
}

export function clampPourTarget(value) {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 80) return null;
  return Math.round(n * 10) / 10;
}

export function normalizePourTargets(value) {
  const next = { ...DEFAULT_POUR_TARGETS };
  for (const type of DRINK_TYPES) {
    const clamped = clampPourTarget(value?.[type]);
    if (clamped != null) next[type] = clamped;
  }
  return next;
}

export function pourTargetsFromValues(values) {
  const partial = {};
  for (const type of DRINK_TYPES) {
    const raw = values?.[POUR_TARGET_KEYS[type]];
    if (raw != null && raw !== "") partial[type] = raw;
  }
  return normalizePourTargets(partial);
}

function requireConfigTableId(tableId) {
  if (!tableId) {
    const error = new Error(
      'Baserow table "App Config" not found. Run npm run setup:baserow-ops.',
    );
    error.status = 503;
    throw error;
  }
  return tableId;
}

async function loadConfigRows(env) {
  const tableId = await resolveConfigTableId(env);
  if (!tableId) return { tableId: "", rows: [] };

  const cacheKey = `${tableId}|${siteEnvName(env)}`;
  if (cache.rows && cache.key === cacheKey && Date.now() - cache.at < CONFIG_CACHE_TTL_MS) {
    return { tableId, rows: cache.rows };
  }
  const rows = await listAllRows(env, tableId);
  cache = { key: cacheKey, at: Date.now(), rows };
  return { tableId, rows };
}

/** Flat key/value map. Missing table → empty map (callers apply defaults). */
export async function getConfigValues(env, { service = "ops" } = {}) {
  const { rows } = await loadConfigRows(env);
  return valuesFromRows(rows, siteEnvName(env), service);
}

export async function getConfigString(env, key, { service = "ops" } = {}) {
  try {
    const values = await getConfigValues(env, { service });
    return values[key]?.trim() || "";
  } catch (error) {
    if (error?.status === 503) return "";
    throw error;
  }
}

/**
 * Create or patch one App Config row. Env=all + Service=ops unless overridden.
 */
export async function setConfigString(
  env,
  key,
  value,
  { envName = "all", service = "ops" } = {},
) {
  const tableId = requireConfigTableId(await resolveConfigTableId(env));
  const loaded = await loadConfigRows(env);
  await upsertConfigValue(env, tableId, loaded.rows || [], key, value, {
    envName,
    service,
  });
  bustConfigCache();
}

/**
 * Merge App Config into a plain env-like object.
 * Binding/env values win when already set (bootstrap + secrets stay authoritative).
 */
export async function applyOpsAppConfig(env = {}) {
  let values = {};
  try {
    values = await getConfigValues(env, { service: "ops" });
  } catch (error) {
    if (error?.status !== 503) throw error;
  }
  const pick = (envKey, configKey) => {
    const fromEnv = env[envKey]?.trim?.() || env[envKey] || "";
    if (fromEnv) return String(fromEnv).trim();
    return values[configKey]?.trim() || "";
  };
  const webhook =
    pick("SITE_DEPLOY_WEBHOOK_URL", OPS_CONFIG_KEYS.siteDeployWebhookUrl) ||
    pick("SANITY_STUDIO_SITE_DEPLOY_URL", OPS_CONFIG_KEYS.siteDeployWebhookUrl);
  return {
    ...env,
    SANITY_PROJECT_ID:
      pick("SANITY_PROJECT_ID", OPS_CONFIG_KEYS.sanityProjectId) ||
      DEFAULT_SANITY_PROJECT_ID,
    SANITY_DATASET: pick("SANITY_DATASET", OPS_CONFIG_KEYS.sanityDataset),
    SITE_DEPLOY_WEBHOOK_URL: webhook,
    SANITY_STUDIO_SITE_DEPLOY_URL:
      env.SANITY_STUDIO_SITE_DEPLOY_URL?.trim() || webhook,
    GOOGLE_OAUTH_CLIENT_ID: pick(
      "GOOGLE_OAUTH_CLIENT_ID",
      OPS_CONFIG_KEYS.googleOauthClientId,
    ),
  };
}

/** Pour-cost targets for ops. Missing/invalid config → built-in defaults. */
export async function getPourTargets(env) {
  try {
    const values = await getConfigValues(env, { service: "ops" });
    return pourTargetsFromValues(values);
  } catch (error) {
    if (error?.status === 503) return { ...DEFAULT_POUR_TARGETS };
    throw error;
  }
}

async function upsertConfigValue(env, tableId, rows, key, value, { envName, service }) {
  const wantEnv = envName || "all";
  const wantService = service || "ops";
  const match = (rows || []).find((row) => {
    const name = text(row.Name) || text(row.Key);
    return (
      name === key &&
      selectValue(row.Env) === wantEnv &&
      selectValue(row.Service) === wantService
    );
  });
  const fields = {
    Name: key,
    Value: String(value),
    Env: wantEnv,
    Service: wantService,
  };
  if (match) {
    const row = await updateRow(env, tableId, match.id, fields);
    return row;
  }
  return createRow(env, tableId, fields);
}

/**
 * Persist pour targets (creates or patches App Config rows).
 * Uses Env=all + Service=ops so every ops environment shares house targets.
 */
export async function setPourTargets(env, partial) {
  const tableId = requireConfigTableId(await resolveConfigTableId(env));
  const loaded = await loadConfigRows(env);
  const rows = [...(loaded.rows || [])];
  const next = normalizePourTargets({
    ...(await getPourTargets(env)),
    ...partial,
  });
  for (const type of DRINK_TYPES) {
    const row = await upsertConfigValue(
      env,
      tableId,
      rows,
      POUR_TARGET_KEYS[type],
      next[type],
      {
        envName: "all",
        service: "ops",
      },
    );
    const idx = rows.findIndex((item) => String(item.id) === String(row.id));
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
  }
  bustConfigCache();
  return next;
}

export async function resetPourTargets(env) {
  return setPourTargets(env, { ...DEFAULT_POUR_TARGETS });
}
