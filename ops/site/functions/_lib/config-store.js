/**
 * Ops runtime non-secret config (Baserow "Gwenda Config", Service = ops).
 * Resolution rules live in shared/config-db.js. Secrets never belong here.
 */
import {
  CONFIG_CACHE_TTL_MS,
  configEnvName,
  getConfigString as getSharedConfigString,
  getConfigValues as getSharedConfigValues,
  resetConfigCacheForTests,
  setConfigValue,
  valuesFromRows,
} from "../../../../shared/config-db.js";
import {
  OPS_DATABASE_NAME,
  OPS_PRODUCTION_DATABASE_ID,
  opsDatabaseId,
} from "./baserow.js";

export { CONFIG_CACHE_TTL_MS, resetConfigCacheForTests, valuesFromRows };

const SERVICE = "ops";

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

/** Non-secret ops settings (config Name column). */
export const OPS_CONFIG_KEYS = {
  sanityProjectId: "sanity.project_id",
  sanityDataset: "sanity.dataset",
  siteDeployWebhookUrl: "site_deploy.webhook_url",
  googleOauthClientId: "google.oauth_client_id",
  googleDriveEventsFolderId: "google.drive_events_folder_id",
  googleCalendarId: "google.calendar_id",
  taskRoleSocial: "tasks.role.social",
  clickupEventsListId: "clickup.events_list_id",
  webOrigin: "web.origin",
};

export const DEFAULT_SANITY_PROJECT_ID = "pn5yjro6";

const DRINK_TYPES = Object.keys(POUR_TARGET_KEYS);

export const siteEnvName = configEnvName;

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
  // npm run ops:prod: a local copy with production powers. Always flagged.
  const localLive = String(env.OPS_LOCAL_LIVE || "") === "1";
  if (localLive) risk = "local_live";
  else if (siteEnv !== "production" && isProductionDb) risk = "nonprod_on_production_db";
  else if (siteEnv === "production" && databaseId && !isProductionDb) {
    risk = "production_on_nonprod_db";
  }

  return {
    siteEnv,
    envLabel: localLive
      ? "LOCAL COPY ON LIVE DATA: changes affect the real website"
      : envLabel,
    databaseId,
    databaseLabel,
    isProductionDb,
    risk,
  };
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

/** Flat key/value map for ops in this env. */
export async function getConfigValues(env) {
  return getSharedConfigValues(env, SERVICE);
}

/** One ops value, or "" when unset / config unavailable. */
export async function getConfigString(env, key) {
  return getSharedConfigString(env, SERVICE, key);
}

/** Write this env's ops row for `key`. */
export async function setConfigString(env, key, value) {
  await setConfigValue(env, SERVICE, key, value);
}

/**
 * Merge config into a plain env-like object.
 * Binding/env values win when already set (bootstrap + secrets stay authoritative).
 */
export async function applyOpsAppConfig(env = {}) {
  let values = {};
  try {
    values = await getConfigValues(env);
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
    WEB_ORIGIN: pick("WEB_ORIGIN", OPS_CONFIG_KEYS.webOrigin),
  };
}

/** Pour-cost targets for ops. Missing/invalid config → built-in defaults. */
export async function getPourTargets(env) {
  try {
    return pourTargetsFromValues(await getConfigValues(env));
  } catch (error) {
    if (error?.status === 503) return { ...DEFAULT_POUR_TARGETS };
    throw error;
  }
}

/** Persist pour targets as this env's rows. */
export async function setPourTargets(env, partial) {
  const next = normalizePourTargets({
    ...(await getPourTargets(env)),
    ...partial,
  });
  for (const type of DRINK_TYPES) {
    await setConfigString(env, POUR_TARGET_KEYS[type], next[type]);
  }
  return next;
}

export async function resetPourTargets(env) {
  return setPourTargets(env, { ...DEFAULT_POUR_TARGETS });
}
