/**
 * Bitwarden Secrets Manager (bws) helpers for ops credential sync.
 * Password Manager (`bw` / env:pull) stays separate — this is machine-account access.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_SM_SERVER = "https://vault.bitwarden.eu";

/** Gwenda org Secrets Manager project (Cloudflare tooling). */
export const DEFAULT_ARK_PROJECT_ID = "b9de9355-0a8f-45e7-b5fe-b4ca00eff281";

/** Gwenda ops Secrets Manager project (machine accounts ark-local / ark-ci). */
export const DEFAULT_OPS_PROJECT_ID = "ea9095b4-8226-4dec-96c3-b4c8008b0b6b";

/** Gwenda marketing web Secrets Manager project (`Ark/Web`). */
export const DEFAULT_WEB_PROJECT_ID = "d7881774-3a4c-4603-97e3-b4c8010fd860";

export function resolveArkProjectId(env = process.env) {
  return env.BWS_ARK_PROJECT_ID?.trim() || DEFAULT_ARK_PROJECT_ID;
}

export function resolveOpsProjectId(env = process.env) {
  return env.BWS_OPS_PROJECT_ID?.trim() || DEFAULT_OPS_PROJECT_ID;
}

export function resolveWebProjectId(env = process.env) {
  return env.BWS_WEB_PROJECT_ID?.trim() || DEFAULT_WEB_PROJECT_ID;
}

/** Org Cloudflare keys written to `.env.ark` (`npm run env:ark:pull`). */
export const ARK_ENV_SECRET_KEYS = [
  "CLOUDFLARE_DEV_API_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

/**
 * Web-owned keys that ops pull still copies into `.env.ops`.
 * Ownership stays Ark/Web; ops is allowed to read them.
 */
export const OPS_CONSUMES_WEB_SECRET_KEYS = [
  "SANITY_API_TOKEN",
  "DEPLOY_WEBHOOK_SECRET",
];

/**
 * Secret keys written to `.env.ops` for local ops.
 * SANITY_API_TOKEN and DEPLOY_WEBHOOK_SECRET are owned by Ark/Web.
 *
 * `BASEROW_API_KEY` in `.env.ops` is always the *resolved* local/dev token.
 * SM stores dual-env ops Baserow tokens as:
 *   BASEROW_API_KEY_LOCAL        Gwenda Dev Ops DB (local)
 *   BASEROW_API_KEY_PRODUCTION   Gwenda production Ops DB (Pages)
 * Legacy SM key `BASEROW_API_KEY` is treated as LOCAL only (never for Pages).
 */
export const OPS_ENV_SECRET_KEYS = [
  "BASEROW_API_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
  "OPS_SESSION_SECRET",
  "OPS_LOCAL_ADMIN_PW",
  "OPS_BYPASS_KEY",
  "LIGHTSPEED_BO_EMAIL",
  "LIGHTSPEED_BO_PASSWORD",
  "LIGHTSPEED_BO_TOTP",
  "LIGHTSPEED_OPS_EMAIL",
  "SANITY_API_TOKEN",
  "DEPLOY_WEBHOOK_SECRET",
  "BASEROW_WEBSITE_API_KEY",
];

/** SM key names for ops Baserow (suffix = env; never fall back across envs). */
export const OPS_BASEROW_SM_KEY_LOCAL = "BASEROW_API_KEY_LOCAL";
export const OPS_BASEROW_SM_KEY_PRODUCTION = "BASEROW_API_KEY_PRODUCTION";
/** @deprecated Prefer BASEROW_API_KEY_LOCAL. Still accepted as local-only. */
export const OPS_BASEROW_SM_KEY_LEGACY = "BASEROW_API_KEY";

/**
 * Secret keys written to `.env.web` for local marketing web.
 * SM stores marketing Baserow tokens as:
 *   BASEROW_API_KEY_MARKETING              Gwenda Dev website DB (local)
 *   BASEROW_API_KEY_MARKETING_STAGING      Website Staging DB (staging Pages)
 *   BASEROW_API_KEY_MARKETING_PRODUCTION   Gwenda production website DB
 * Ops uses BASEROW_API_KEY_LOCAL / BASEROW_API_KEY_PRODUCTION (not marketing).
 * Ops `/forms` reads Form Submissions with BASEROW_WEBSITE_API_KEY, remapped
 * from the matching marketing token (local: BASEROW_API_KEY_MARKETING,
 * production: BASEROW_API_KEY_MARKETING_PRODUCTION). Not a separate SM secret.
 * Apple Wallet PEMs stay in GitHub / Password Manager for now.
 */
export const WEB_ENV_SECRET_KEYS = [
  "BASEROW_API_KEY",
  "SUBSCRIBE_SECRET",
  "EVENT_ADMIN_SECRET",
  "SANITY_API_TOKEN",
  "DEPLOY_WEBHOOK_SECRET",
  "SMTP_PASSWORD",
  "SITE_PASSWORD",
  "GATE_BYPASS_KEY",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
];

/** SM key remapped when writing `.env.web` / Pages env (local + staging). */
export const WEB_SM_KEY_ALIASES = {
  BASEROW_API_KEY_MARKETING: "BASEROW_API_KEY",
  BASEROW_API_KEY_MARKETING_STAGING: "BASEROW_API_KEY",
};

/** SM key remapped for production Pages / Mailchimp. */
export const WEB_PRODUCTION_SM_KEY_ALIASES = {
  BASEROW_API_KEY_MARKETING_PRODUCTION: "BASEROW_API_KEY",
};

export function webBaserowSmKey(profile = "staging") {
  if (profile === "production") return "BASEROW_API_KEY_MARKETING_PRODUCTION";
  if (profile === "local" || profile === "development") {
    return "BASEROW_API_KEY_MARKETING";
  }
  return "BASEROW_API_KEY_MARKETING_STAGING";
}

/**
 * Canonical SM key for ops Baserow for a pull/deploy profile.
 * @param {"local" | "development" | "production"} [profile]
 */
export function opsBaserowSmKey(profile = "local") {
  if (profile === "production") return OPS_BASEROW_SM_KEY_PRODUCTION;
  return OPS_BASEROW_SM_KEY_LOCAL;
}

/**
 * Resolve the ops Baserow token for a profile from SM.
 * Never cross-falls back: production never uses local, local never uses production.
 * Local may read legacy SM key `BASEROW_API_KEY` when `_LOCAL` is unset.
 * @param {Map<string, string>} allSecrets
 * @param {"local" | "development" | "production"} [profile]
 * @returns {string}
 */
export function resolveOpsBaserowToken(allSecrets, profile = "local") {
  const preferred = opsBaserowSmKey(profile);
  const primary = String(allSecrets.get(preferred) ?? "").trim();
  if (primary) return primary;
  if (profile === "local" || profile === "development") {
    return String(allSecrets.get(OPS_BASEROW_SM_KEY_LEGACY) ?? "").trim();
  }
  return "";
}

const BWS_VERSION = "2.1.0";
const BWS_ASSET = `bws-x86_64-unknown-linux-gnu-${BWS_VERSION}.zip`;
const BWS_URL = `https://github.com/bitwarden/sdk-sm/releases/download/bws-v${BWS_VERSION}/${BWS_ASSET}`;

function localBwsPath() {
  return join(homedir(), ".local", "bin", "bws");
}

export function resolveBwsBin() {
  const fromPath = spawnSync("bws", ["--version"], { encoding: "utf8" });
  if (fromPath.status === 0) return "bws";
  const local = localBwsPath();
  if (existsSync(local)) {
    const check = spawnSync(local, ["--version"], { encoding: "utf8" });
    if (check.status === 0) return local;
  }
  return null;
}

/** Install bws into ~/.local/bin when missing (Linux x86_64). */
export function ensureBwsInstalled() {
  const existing = resolveBwsBin();
  if (existing) return existing;

  const binDir = join(homedir(), ".local", "bin");
  mkdirSync(binDir, { recursive: true });
  const zipPath = join(binDir, BWS_ASSET);
  const binPath = localBwsPath();

  console.log(`Installing bws ${BWS_VERSION} → ${binPath}`);
  const curl = spawnSync("curl", ["-sL", "-o", zipPath, BWS_URL], {
    encoding: "utf8",
  });
  if (curl.status !== 0) {
    throw new Error(
      `Failed to download bws: ${curl.stderr || curl.stdout || "curl error"}`,
    );
  }
  const unzip = spawnSync("unzip", ["-o", "-j", zipPath, "bws", "-d", binDir], {
    encoding: "utf8",
  });
  if (unzip.status !== 0) {
    throw new Error(
      `Failed to unzip bws: ${unzip.stderr || unzip.stdout || "unzip error"}`,
    );
  }
  chmodSync(binPath, 0o755);
  try {
    unlinkSync(zipPath);
  } catch {
    /* ignore */
  }
  const check = spawnSync(binPath, ["--version"], { encoding: "utf8" });
  if (check.status !== 0) {
    throw new Error("bws installed but --version failed");
  }
  return binPath;
}

export function runBws(args, { accessToken, serverUrl } = {}) {
  const bin = ensureBwsInstalled();
  const token = accessToken || process.env.BWS_ACCESS_TOKEN?.trim() || "";
  if (!token) {
    throw new Error(
      "Missing Secrets Manager access token. Set ARK_LOCAL_BW_TOKEN in .env (local) or BWS_ACCESS_TOKEN / ARK_CI_BW_TOKEN (CI).",
    );
  }
  const server = (
    serverUrl ||
    process.env.BWS_SERVER_URL ||
    DEFAULT_SM_SERVER
  ).replace(/\/$/, "");
  const result = spawnSync(
    bin,
    ["-t", token, "-u", server, "-o", "json", ...args],
    { encoding: "utf8", env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(detail || `bws ${args.join(" ")} failed`);
  }
  const out = (result.stdout ?? "").trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

export function resolveSmAccessToken(env = process.env) {
  return (
    env.BWS_ACCESS_TOKEN?.trim() ||
    env.ARK_LOCAL_BW_TOKEN?.trim() ||
    env.ARK_CI_BW_TOKEN?.trim() ||
    ""
  );
}

/**
 * @returns {Map<string, string>} key → value for secrets the machine account can read
 */
export function listSmSecrets({
  accessToken,
  serverUrl,
  projectId = resolveOpsProjectId(),
} = {}) {
  const entries = listSmSecretEntries({ accessToken, serverUrl, projectId });
  const map = new Map();
  for (const [key, entry] of entries) {
    map.set(key, entry.value);
  }
  return map;
}

/**
 * @returns {Map<string, { id: string, value: string }>}
 */
export function listSmSecretEntries({
  accessToken,
  serverUrl,
  projectId = resolveOpsProjectId(),
} = {}) {
  const token = accessToken || resolveSmAccessToken();
  const args = projectId ? ["secret", "list", projectId] : ["secret", "list"];
  const rows = runBws(args, { accessToken: token, serverUrl });
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected bws secret list response");
  }
  const map = new Map();
  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    map.set(key, {
      id: String(row.id || "").trim(),
      value: row.value == null ? "" : String(row.value),
    });
  }
  return map;
}

/**
 * Merge secret maps. Later maps win.
 * @param {Map<string, string>[]} maps
 * @param {{ onConflict?: (key: string) => void }} [opts]
 */
export function mergeSmSecretMaps(maps, { onConflict } = {}) {
  const out = new Map();
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of map) {
      if (out.has(key) && out.get(key) !== value) {
        onConflict?.(key);
      }
      out.set(key, value);
    }
  }
  return out;
}

export function warnSmKeyConflict(key) {
  console.warn(
    `SM key ${key} exists in more than one project with different values; later project wins.`,
  );
}

/**
 * List secrets from each project and merge (later project ids win).
 * @returns {Map<string, string>}
 */
export function listSmSecretsFromProjects({
  accessToken,
  serverUrl,
  projectIds = [],
  onConflict = warnSmKeyConflict,
} = {}) {
  const maps = [];
  for (const projectId of projectIds.filter(Boolean)) {
    try {
      maps.push(listSmSecrets({ accessToken, serverUrl, projectId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Skipping SM project ${projectId}: ${message}`);
    }
  }
  return mergeSmSecretMaps(maps, { onConflict });
}

export function listMergedOpsSecrets({ accessToken, serverUrl, onConflict } = {}) {
  return listSmSecretsFromProjects({
    accessToken,
    serverUrl,
    projectIds: [
      resolveArkProjectId(),
      resolveWebProjectId(),
      resolveOpsProjectId(),
    ],
    onConflict,
  });
}

export function listMergedWebSecrets({ accessToken, serverUrl, onConflict } = {}) {
  return listSmSecretsFromProjects({
    accessToken,
    serverUrl,
    projectIds: [resolveArkProjectId(), resolveWebProjectId()],
    onConflict,
  });
}

export function pickArkSecrets(allSecrets) {
  const out = new Map();
  for (const key of ARK_ENV_SECRET_KEYS) {
    if (allSecrets.has(key)) out.set(key, allSecrets.get(key) ?? "");
  }
  return out;
}

export function formatArkEnv(values) {
  const lines = [
    "# Generated by npm run env:ark:pull from Bitwarden Secrets Manager (Ark).",
    "# Do not commit. Org Cloudflare tokens. Bootstrap token lives in .env (ARK_LOCAL_BW_TOKEN).",
    "",
  ];
  for (const key of ARK_ENV_SECRET_KEYS) {
    lines.push(`${key}=${values.get(key) ?? ""}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeArkEnvFile(path, allSecrets, { dryRun = false } = {}) {
  const ark = pickArkSecrets(allSecrets);
  const filled = ARK_ENV_SECRET_KEYS.filter(
    (key) => String(ark.get(key) ?? "").trim(),
  );
  const content = formatArkEnv(ark);
  if (!dryRun) writeFileSync(path, content);
  return { wrote: !dryRun, filled, content };
}

/**
 * Resolve ops secrets from SM.
 * Remaps the profile Baserow token onto short `BASEROW_API_KEY` for runtime.
 * Always attaches `BASEROW_API_KEY_PRODUCTION` when present (Pages / CI), without
 * using it as the local runtime key.
 * @param {Map<string, string>} allSecrets
 * @param {{ profile?: "local" | "development" | "production" }} [opts]
 * @returns {Map<string, string>}
 */
export function pickOpsSecrets(allSecrets, { profile = "local" } = {}) {
  const out = new Map();
  for (const key of OPS_ENV_SECRET_KEYS) {
    if (key === "BASEROW_API_KEY") continue;
    if (allSecrets.has(key)) out.set(key, allSecrets.get(key) ?? "");
  }

  const resolved = resolveOpsBaserowToken(allSecrets, profile);
  if (resolved) out.set("BASEROW_API_KEY", resolved);

  const websiteKey =
    profile === "production"
      ? "BASEROW_API_KEY_MARKETING_PRODUCTION"
      : "BASEROW_API_KEY_MARKETING";
  const website = String(allSecrets.get(websiteKey) ?? "").trim();
  if (website) out.set("BASEROW_WEBSITE_API_KEY", website);

  const production = String(
    allSecrets.get(OPS_BASEROW_SM_KEY_PRODUCTION) ?? "",
  ).trim();
  if (production) out.set(OPS_BASEROW_SM_KEY_PRODUCTION, production);

  const localCanonical = String(
    allSecrets.get(OPS_BASEROW_SM_KEY_LOCAL) ?? "",
  ).trim();
  if (localCanonical) out.set(OPS_BASEROW_SM_KEY_LOCAL, localCanonical);

  return out;
}

/**
 * Resolve marketing web secrets from SM (applies Baserow key alias for profile).
 * @param {Map<string, string>} allSecrets
 * @param {{ profile?: "staging" | "production" }} [opts]
 * @returns {Map<string, string>} local key → value
 */
export function pickWebSecrets(allSecrets, { profile = "staging" } = {}) {
  const out = new Map();
  const aliases =
    profile === "production"
      ? WEB_PRODUCTION_SM_KEY_ALIASES
      : profile === "local" || profile === "development"
        ? { BASEROW_API_KEY_MARKETING: "BASEROW_API_KEY" }
        : WEB_SM_KEY_ALIASES;
  for (const [smKey, localKey] of Object.entries(aliases)) {
    const value = allSecrets.get(smKey);
    if (value != null && String(value).trim()) {
      out.set(localKey, value);
    }
  }
  for (const key of WEB_ENV_SECRET_KEYS) {
    if (out.has(key)) continue;
    if (allSecrets.has(key)) out.set(key, allSecrets.get(key) ?? "");
  }
  return out;
}

/**
 * Create or update a secret in Secrets Manager.
 * @returns {"created" | "updated" | "unchanged"}
 */
export function upsertSmSecret({
  key,
  value,
  accessToken,
  serverUrl,
  projectId = resolveOpsProjectId(),
  note,
} = {}) {
  const trimmedKey = String(key || "").trim();
  const trimmedValue = value == null ? "" : String(value);
  if (!trimmedKey) throw new Error("upsertSmSecret requires key");
  if (!trimmedValue.trim()) throw new Error(`upsertSmSecret ${trimmedKey}: empty value`);
  if (!projectId) throw new Error("upsertSmSecret requires projectId");

  const token = accessToken || resolveSmAccessToken();
  const entries = listSmSecretEntries({ accessToken: token, serverUrl, projectId });
  const existing = entries.get(trimmedKey);
  if (existing?.id) {
    if (existing.value === trimmedValue) return "unchanged";
    const args = ["secret", "edit", existing.id, "--value", trimmedValue];
    if (note) args.push("--note", note);
    runBws(args, { accessToken: token, serverUrl });
    return "updated";
  }
  const args = ["secret", "create", trimmedKey, trimmedValue, projectId];
  if (note) args.push("--note", note);
  runBws(args, { accessToken: token, serverUrl });
  return "created";
}

/**
 * Ensure SM has BASEROW_API_KEY_LOCAL. If only the legacy bare BASEROW_API_KEY
 * exists, copy it to _LOCAL (does not delete the legacy key).
 * @returns {"created" | "updated" | "unchanged" | "skipped"}
 */
export function ensureOpsBaserowLocalSmKey({
  allSecrets,
  accessToken,
  serverUrl,
  projectId = resolveOpsProjectId(),
} = {}) {
  const secrets = allSecrets || new Map();
  const local = String(secrets.get(OPS_BASEROW_SM_KEY_LOCAL) ?? "").trim();
  if (local) return "unchanged";
  const legacy = String(secrets.get(OPS_BASEROW_SM_KEY_LEGACY) ?? "").trim();
  if (!legacy) return "skipped";
  return upsertSmSecret({
    key: OPS_BASEROW_SM_KEY_LOCAL,
    value: legacy,
    accessToken,
    serverUrl,
    projectId,
    note: "Gwenda Dev Ops DB token (renamed from BASEROW_API_KEY). Pages uses BASEROW_API_KEY_PRODUCTION.",
  });
}

/** Delete a secret by key within a project. @returns {boolean} true if deleted */
export function deleteSmSecretByKey({
  key,
  accessToken,
  serverUrl,
  projectId = resolveOpsProjectId(),
} = {}) {
  const trimmedKey = String(key || "").trim();
  if (!trimmedKey) throw new Error("deleteSmSecretByKey requires key");
  const token = accessToken || resolveSmAccessToken();
  const entries = listSmSecretEntries({ accessToken: token, serverUrl, projectId });
  const existing = entries.get(trimmedKey);
  if (!existing?.id) return false;
  runBws(["secret", "delete", existing.id], { accessToken: token, serverUrl });
  return true;
}
