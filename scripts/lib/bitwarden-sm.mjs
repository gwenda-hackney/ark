/**
 * Bitwarden Secrets Manager (bws) for app secrets.
 * Password Manager (`bw` / env:pull) stays separate. This is machine-account access.
 *
 * One rule for every secret:
 *   NAME              shared value (all envs)
 *   NAME__LOCAL       override for local
 *   NAME__STAGING     override for staging
 *   NAME__PRODUCTION  override for production
 * The env override wins. Secrets that must differ per env (Baserow tokens) have
 * no shared NAME, so a missing override is reported instead of falling back.
 *
 * Projects (Ark, Ark/Ops, Ark/Web) only record ownership. Pulls merge all three.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_SM_SERVER = "https://vault.bitwarden.eu";

export const DEFAULT_ARK_PROJECT_ID = "b9de9355-0a8f-45e7-b5fe-b4ca00eff281";
export const DEFAULT_OPS_PROJECT_ID = "ea9095b4-8226-4dec-96c3-b4c8008b0b6b";
export const DEFAULT_WEB_PROJECT_ID = "d7881774-3a4c-4603-97e3-b4c8010fd860";

export const SECRET_ENVS = ["local", "staging", "production"];
export const ENV_OVERRIDE_SEPARATOR = "__";

export function resolveProjectIds(env = process.env) {
  return {
    ark: env.BWS_ARK_PROJECT_ID?.trim() || DEFAULT_ARK_PROJECT_ID,
    ops: env.BWS_OPS_PROJECT_ID?.trim() || DEFAULT_OPS_PROJECT_ID,
    web: env.BWS_WEB_PROJECT_ID?.trim() || DEFAULT_WEB_PROJECT_ID,
  };
}

/** Owning SM project for each secret base name. */
export const SECRET_OWNERS = {
  ark: [
    "CLOUDFLARE_DEV_API_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "BASEROW_CONFIG_API_KEY",
  ],
  ops: [
    "BASEROW_OPS_API_KEY",
    "BASEROW_OPS_DEV_API_KEY",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "OPS_SESSION_SECRET",
    "OPS_LOCAL_ADMIN_PW",
  ],
  web: [
    "BASEROW_WEBSITE_API_KEY",
    "FORMS_ADMIN_SECRET",
    "SANITY_API_TOKEN",
    "DEPLOY_WEBHOOK_SECRET",
    "SUBSCRIBE_SECRET",
    "SMTP_PASSWORD",
    "SITE_PASSWORD",
    "GATE_BYPASS_KEY",
    "SANITY_DEPLOY_TOKEN",
    "UNIFI_SITE_MANAGER_API_KEY",
  ],
};

/** Local secrets file, written by `npm run env:secrets:pull` under SM names. */
export const LOCAL_SECRETS_FILE = ".env.secrets";

/**
 * Runtime keys each app gets. Runtime name = SM name except `rename`
 * (runtime → SM), where an app reads a secret under its own name. Locally the
 * rename is applied by scripts/lib/load-env.mjs; CI gets runtime names from
 * `--github-env`. `pagesSkip` stays out of Cloudflare Pages.
 */
export const APP_SECRETS = {
  ark: {
    keys: ["CLOUDFLARE_DEV_API_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    rename: {},
    pagesSkip: [],
  },
  ops: {
    keys: [
      "BASEROW_API_KEY",
      // Gwenda Dev copy of the Ops DB, so the Website page can compare it.
      "BASEROW_OPS_DEV_API_KEY",
      "BASEROW_WEBSITE_API_KEY",
      "BASEROW_CONFIG_API_KEY",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
      "OPS_SESSION_SECRET",
      "OPS_LOCAL_ADMIN_PW",
      "SANITY_API_TOKEN",
      "DEPLOY_WEBHOOK_SECRET",
      "FORMS_ADMIN_SECRET",
    ],
    rename: {
      BASEROW_API_KEY: "BASEROW_OPS_API_KEY",
      GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "GOOGLE_SERVICE_ACCOUNT_JSON",
    },
    pagesSkip: ["OPS_LOCAL_ADMIN_PW"],
  },
  web: {
    keys: [
      "BASEROW_API_KEY",
      "BASEROW_OPS_API_KEY",
      "BASEROW_CONFIG_API_KEY",
      "SUBSCRIBE_SECRET",
      "FORMS_ADMIN_SECRET",
      "SANITY_API_TOKEN",
      "DEPLOY_WEBHOOK_SECRET",
      "GMAIL_SERVICE_ACCOUNT_JSON",
      "SMTP_PASSWORD",
      "SITE_PASSWORD",
      "GATE_BYPASS_KEY",
      "SANITY_DEPLOY_TOKEN",
      "UNIFI_SITE_MANAGER_API_KEY",
    ],
    rename: {
      BASEROW_API_KEY: "BASEROW_WEBSITE_API_KEY",
      GMAIL_SERVICE_ACCOUNT_JSON: "GOOGLE_SERVICE_ACCOUNT_JSON",
    },
    pagesSkip: ["SANITY_DEPLOY_TOKEN", "UNIFI_SITE_MANAGER_API_KEY"],
  },
};

/** Every SM secret name some app uses, in manifest order (for the local file). */
export function localSecretNames() {
  const names = [];
  for (const app of Object.keys(APP_SECRETS)) {
    for (const key of APP_SECRETS[app].keys) {
      const smName = smNameFor(app, key);
      if (!names.includes(smName)) names.push(smName);
    }
  }
  return names;
}

export function appSecrets(app) {
  const spec = APP_SECRETS[app];
  if (!spec) {
    throw new Error(`Unknown app "${app}". Use one of: ${Object.keys(APP_SECRETS).join(", ")}.`);
  }
  return spec;
}

export function smNameFor(app, runtimeKey) {
  return appSecrets(app).rename[runtimeKey] || runtimeKey;
}

export function ownerOf(smName) {
  for (const [project, names] of Object.entries(SECRET_OWNERS)) {
    if (names.includes(smName)) return project;
  }
  return null;
}

export function normalizeSecretEnv(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "development" || raw === "dev") return "local";
  if (raw === "prod") return "production";
  if (!SECRET_ENVS.includes(raw)) {
    throw new Error(`Unknown env "${value}". Use one of: ${SECRET_ENVS.join(", ")}.`);
  }
  return raw;
}

/** Split `NAME__ENV` into base name + env (env is null for shared names). */
export function parseSecretKey(key) {
  const idx = key.lastIndexOf(ENV_OVERRIDE_SEPARATOR);
  if (idx > 0) {
    const env = key.slice(idx + ENV_OVERRIDE_SEPARATOR.length).toLowerCase();
    if (SECRET_ENVS.includes(env)) return { name: key.slice(0, idx), env };
  }
  return { name: key, env: null };
}

export function envSecretKey(name, env) {
  return env ? `${name}${ENV_OVERRIDE_SEPARATOR}${env.toUpperCase()}` : name;
}

/**
 * Collapse raw SM keys for one env: `NAME__ENV` beats `NAME`.
 * Overrides for other envs are dropped.
 * @param {Map<string, string>} raw
 * @param {string} env
 * @returns {Map<string, string>} base name → value
 */
export function resolveSecretsForEnv(raw, env) {
  const target = normalizeSecretEnv(env);
  const shared = new Map();
  const overrides = new Map();
  for (const [key, value] of raw) {
    if (!String(value ?? "").trim()) continue;
    const parsed = parseSecretKey(key);
    if (parsed.env === null) shared.set(parsed.name, value);
    else if (parsed.env === target) overrides.set(parsed.name, value);
  }
  return new Map([...shared, ...overrides]);
}

/**
 * Runtime env for an app: resolved SM values under the app's runtime names.
 * @returns {{ values: Map<string, string>, missing: string[] }}
 */
export function pickAppSecrets(app, resolved) {
  const spec = appSecrets(app);
  const values = new Map();
  const missing = [];
  for (const key of spec.keys) {
    const value = resolved.get(smNameFor(app, key));
    if (value == null || !String(value).trim()) missing.push(key);
    else values.set(key, String(value));
  }
  return { values, missing };
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
  const token = accessToken || resolveSmAccessToken();
  if (!token) {
    throw new Error(
      "Missing Secrets Manager access token. Set ARK_LOCAL_BW_TOKEN in .env (local) or BWS_ACCESS_TOKEN (CI).",
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

/** @returns {Map<string, { id: string, value: string }>} */
export function listSmSecretEntries({ accessToken, serverUrl, projectId } = {}) {
  if (!projectId) throw new Error("listSmSecretEntries requires projectId");
  const rows = runBws(["secret", "list", projectId], { accessToken, serverUrl });
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
 * Raw keys from every project. A key must live in one project only.
 * @returns {Map<string, string>}
 */
export function listAllSmSecrets({ accessToken, serverUrl } = {}) {
  const out = new Map();
  const seenIn = new Map();
  for (const [project, projectId] of Object.entries(resolveProjectIds())) {
    const entries = listSmSecretEntries({ accessToken, serverUrl, projectId });
    for (const [key, entry] of entries) {
      if (seenIn.has(key)) {
        throw new Error(
          `SM key ${key} exists in both ${seenIn.get(key)} and ${project}. Keep it in one project.`,
        );
      }
      seenIn.set(key, project);
      out.set(key, entry.value);
    }
  }
  return out;
}

/**
 * Resolve an app's runtime secrets for one env straight from SM.
 * @returns {{ values: Map<string, string>, missing: string[], raw: Map<string, string> }}
 */
export function loadAppSecretsFromSm(app, env, { accessToken, serverUrl } = {}) {
  const raw = listAllSmSecrets({ accessToken, serverUrl });
  const picked = pickAppSecrets(app, resolveSecretsForEnv(raw, env));
  return { ...picked, raw };
}

/**
 * Create or update a secret in its owning project.
 * @returns {"created" | "updated" | "unchanged"}
 */
export function upsertSmSecret({ key, value, accessToken, serverUrl, note } = {}) {
  const trimmedKey = String(key || "").trim();
  const trimmedValue = value == null ? "" : String(value);
  if (!trimmedKey) throw new Error("upsertSmSecret requires key");
  if (!trimmedValue.trim()) throw new Error(`upsertSmSecret ${trimmedKey}: empty value`);
  const owner = ownerOf(parseSecretKey(trimmedKey).name);
  if (!owner) {
    throw new Error(`${trimmedKey} has no owning project. Add it to SECRET_OWNERS first.`);
  }
  const projectId = resolveProjectIds()[owner];

  const entries = listSmSecretEntries({ accessToken, serverUrl, projectId });
  const existing = entries.get(trimmedKey);
  if (existing?.id) {
    if (existing.value === trimmedValue) return "unchanged";
    const args = ["secret", "edit", existing.id, "--value", trimmedValue];
    if (note) args.push("--note", note);
    runBws(args, { accessToken, serverUrl });
    return "updated";
  }
  const args = ["secret", "create", trimmedKey, trimmedValue, projectId];
  if (note) args.push("--note", note);
  runBws(args, { accessToken, serverUrl });
  return "created";
}

/** Delete a secret by key from whichever project holds it. @returns {boolean} */
export function deleteSmSecretByKey({ key, accessToken, serverUrl } = {}) {
  const trimmedKey = String(key || "").trim();
  if (!trimmedKey) throw new Error("deleteSmSecretByKey requires key");
  for (const projectId of Object.values(resolveProjectIds())) {
    const existing = listSmSecretEntries({ accessToken, serverUrl, projectId }).get(trimmedKey);
    if (!existing?.id) continue;
    runBws(["secret", "delete", existing.id], { accessToken, serverUrl });
    return true;
  }
  return false;
}
