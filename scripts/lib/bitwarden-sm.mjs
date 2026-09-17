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
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_SM_SERVER = "https://vault.bitwarden.eu";

/** Gwenda ops Secrets Manager project (machine accounts ark-local / ark-ci). */
export const DEFAULT_OPS_PROJECT_ID = "ea9095b4-8226-4dec-96c3-b4c8008b0b6b";

/** Gwenda marketing web Secrets Manager project (`Ark/Web`). */
export const DEFAULT_WEB_PROJECT_ID = "d7881774-3a4c-4603-97e3-b4c8010fd860";

export function resolveOpsProjectId(env = process.env) {
  return env.BWS_OPS_PROJECT_ID?.trim() || DEFAULT_OPS_PROJECT_ID;
}

export function resolveWebProjectId(env = process.env) {
  return env.BWS_WEB_PROJECT_ID?.trim() || DEFAULT_WEB_PROJECT_ID;
}

/**
 * Secret keys written to `.env.ops` for local ops.
 * Other SM keys (e.g. CLOUDFLARE_DEV_API_TOKEN) stay in shared `.env`.
 */
export const OPS_ENV_SECRET_KEYS = [
  "BASEROW_API_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "OPS_SESSION_SECRET",
  "OPS_LOCAL_ADMIN_PW",
  "OPS_BYPASS_KEY",
  "SANITY_API_TOKEN",
  "DEPLOY_WEBHOOK_SECRET",
];

/**
 * Secret keys written to `.env.web` for local marketing web.
 * SM stores the marketing Baserow token as BASEROW_API_KEY_MARKETING
 * (ops BASEROW_API_KEY is Free-workspace only and cannot see Subscribers).
 * Apple Wallet PEMs stay in GitHub / Password Manager for now.
 */
export const WEB_ENV_SECRET_KEYS = [
  "BASEROW_API_KEY",
  "SUBSCRIBE_SECRET",
  "EVENT_ADMIN_SECRET",
  "SANITY_API_TOKEN",
  "SMTP_PASSWORD",
  "SITE_PASSWORD",
  "GATE_BYPASS_KEY",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
];

/** SM key remapped when writing `.env.web` / Pages env. */
export const WEB_SM_KEY_ALIASES = {
  BASEROW_API_KEY_MARKETING: "BASEROW_API_KEY",
};

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

export function pickOpsSecrets(allSecrets) {
  const out = new Map();
  for (const key of OPS_ENV_SECRET_KEYS) {
    if (allSecrets.has(key)) out.set(key, allSecrets.get(key) ?? "");
  }
  return out;
}

/**
 * Resolve marketing web secrets from SM (applies BASEROW_API_KEY_MARKETING alias).
 * @param {Map<string, string>} allSecrets
 * @returns {Map<string, string>} local key → value
 */
export function pickWebSecrets(allSecrets) {
  const out = new Map();
  for (const [smKey, localKey] of Object.entries(WEB_SM_KEY_ALIASES)) {
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
