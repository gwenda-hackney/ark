/**
 * Bitwarden Secrets Manager (bws) for app secrets.
 * Machine-account access. The local token (ARK_LOCAL_BW_TOKEN) is read from the
 * unlocked Password Manager vault; CI passes BWS_ACCESS_TOKEN.
 *
 * One rule for every secret, two envs (dev is a developer's machine and the
 * hosted dev site alike):
 *   NAME              the same value in every env
 *   NAME__DEV         the dev value
 *   NAME__PRODUCTION  the production value
 * A runtime in env E reads NAME and gets NAME__E, else NAME. Code never picks
 * an env itself. The one reader that spans envs (ops comparing production with
 * its dev copy) asks for the suffixed name, e.g. BASEROW_OPS_API_KEY__DEV.
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
import { vaultSmAccessToken } from "./bitwarden-env.mjs";
import { clearSecretsCache } from "./secrets-cache.mjs";

export const DEFAULT_SM_SERVER = "https://vault.bitwarden.eu";

/** SM project names (matched ignoring case), so recreated projects need no code change. */
export const PROJECT_NAMES = { ark: "ark", ops: "ark/ops", web: "ark/web" };

const PROJECT_ID_OVERRIDES = {
  ark: "BWS_ARK_PROJECT_ID",
  ops: "BWS_OPS_PROJECT_ID",
  web: "BWS_WEB_PROJECT_ID",
};

export const SECRET_ENVS = ["dev", "production"];
export const ENV_OVERRIDE_SEPARATOR = "__";

/**
 * Project ids from a `bws project list` result. `BWS_*_PROJECT_ID` overrides win.
 * @param {{ id: string, name: string }[]} projects
 */
export function pickProjectIds(projects, env = process.env) {
  const out = {};
  for (const [owner, name] of Object.entries(PROJECT_NAMES)) {
    const override = env[PROJECT_ID_OVERRIDES[owner]]?.trim();
    if (override) {
      out[owner] = override;
      continue;
    }
    const matches = projects.filter((p) => String(p.name || "").trim().toLowerCase() === name);
    if (matches.length !== 1) {
      throw new Error(
        matches.length
          ? `Several Secrets Manager projects are named ${name}. Keep one.`
          : `No Secrets Manager project named ${name} for this token. Create it, or give the machine account access.`,
      );
    }
    out[owner] = matches[0].id;
  }
  return out;
}

const projectIdsByToken = new Map();

/** Owner → project id, looked up by name once per token and server. */
export function resolveProjectIds({ accessToken, serverUrl, env = process.env } = {}) {
  if (Object.values(PROJECT_ID_OVERRIDES).every((key) => env[key]?.trim())) {
    return pickProjectIds([], env);
  }
  const cacheKey = `${accessToken || ""}\n${serverUrl || ""}`;
  if (!projectIdsByToken.has(cacheKey)) {
    const projects = runBws(["project", "list"], { accessToken, serverUrl });
    if (!Array.isArray(projects)) throw new Error("Unexpected bws project list response");
    projectIdsByToken.set(cacheKey, projects);
  }
  return pickProjectIds(projectIdsByToken.get(cacheKey), env);
}

/** Owning SM project for each secret base name. */
export const SECRET_OWNERS = {
  ark: [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "BASEROW_CONFIG_API_KEY",
    // Script-only (sm-export): the site-deploy Worker's GitHub token.
    "DISPATCH_TOKEN",
    // Script-only: UptimeRobot main API key (setup:uptime, alerts@ account).
    "UPTIME_ROBOT_API_KEY",
  ],
  ops: [
    "BASEROW_OPS_API_KEY",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "OPS_SESSION_SECRET",
    "OPS_LOCAL_ADMIN_PW",
    // Script-only (sm-export): the automation@ Baserow login for schema changes.
    "BASEROW_JWT_EMAIL",
    "BASEROW_JWT_PASSWORD",
  ],
  web: [
    "BASEROW_WEBSITE_API_KEY",
    "FORMS_ADMIN_SECRET",
    "SANITY_API_TOKEN",
    "DEPLOY_WEBHOOK_SECRET",
    "SUBSCRIBE_SECRET",
    "SITE_PASSWORD",
    "GATE_BYPASS_KEY",
    "SANITY_DEPLOY_TOKEN",
    "UNIFI_SITE_MANAGER_API_KEY",
    // Script-only (sm-export): the Mailchimp sync Worker.
    "MAILCHIMP_API_KEY",
    "SUBSCRIBE_MAILCHIMP_SYNC_SECRET",
  ],
};

/**
 * Runtime keys each app gets. Runtime name = SM name except `rename`
 * (runtime → SM), where an app reads a secret under its own name. Locally the
 * rename is applied by scripts/lib/load-env.mjs; CI gets runtime names from
 * `--github-env`. `pagesSkip` stays out of Cloudflare Pages.
 */
export const APP_SECRETS = {
  ark: {
    keys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    rename: {},
    pagesSkip: [],
  },
  ops: {
    keys: [
      "BASEROW_API_KEY",
      // The dev copies, so production ops can compare with them (db-diff.js).
      "BASEROW_OPS_API_KEY__DEV",
      "BASEROW_WEBSITE_API_KEY",
      "BASEROW_CONFIG_API_KEY",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
      "OPS_SESSION_SECRET",
      "OPS_LOCAL_ADMIN_PW",
      "SANITY_API_TOKEN",
      "DEPLOY_WEBHOOK_SECRET",
      "FORMS_ADMIN_SECRET",
      // Form emails resent from /forms go out as the website's mailbox.
      "GMAIL_SERVICE_ACCOUNT_JSON",
    ],
    rename: {
      BASEROW_API_KEY: "BASEROW_OPS_API_KEY",
      GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "GOOGLE_SERVICE_ACCOUNT_JSON",
      GMAIL_SERVICE_ACCOUNT_JSON: "GOOGLE_SERVICE_ACCOUNT_JSON",
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

/** Every SM secret name some app uses, in manifest order (what local loads). */
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

/** Owning project of an SM name (NAME or NAME__ENV). */
export function ownerOf(smName) {
  const { name } = parseSecretKey(smName);
  for (const [project, names] of Object.entries(SECRET_OWNERS)) {
    if (names.includes(name)) return project;
  }
  return null;
}

export function normalizeSecretEnv(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  // A developer's machine is dev.
  if (raw === "local" || raw === "development") return "dev";
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
 * Collapse raw SM keys for one env: NAME gets `NAME__ENV`, else `NAME`.
 * Suffixed names stay available as themselves, for the rare reader that
 * asks for another env's value by name.
 * @param {Map<string, string>} raw
 * @param {string} env
 * @returns {Map<string, string>}
 */
export function resolveSecretsForEnv(raw, env) {
  const target = normalizeSecretEnv(env);
  const shared = new Map();
  const suffixed = new Map();
  const overrides = new Map();
  for (const [key, value] of raw) {
    if (!String(value ?? "").trim()) continue;
    const parsed = parseSecretKey(key);
    if (parsed.env === null) shared.set(parsed.name, value);
    else {
      suffixed.set(key, value);
      if (parsed.env === target) overrides.set(parsed.name, value);
    }
  }
  return new Map([...suffixed, ...shared, ...overrides]);
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

/** True when bws failed because Secrets Manager rate-limited us (HTTP 429). */
export function isSmRateLimited(detail) {
  return /\b429\b|Too Many Requests|Slow down/i.test(String(detail || ""));
}

/** Waits before retry `attempt` (1-based) after a 429: 1.5s, 3s, 6s, 12s. */
export function smRetryDelayMs(attempt) {
  return 1500 * 2 ** (attempt - 1);
}

const SM_MAX_RETRIES = 4;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function runBws(args, { accessToken, serverUrl } = {}) {
  const bin = ensureBwsInstalled();
  const token = accessToken || resolveSmAccessToken();
  if (!token) {
    throw new Error(
      `Missing Secrets Manager access token. ${SM_TOKEN_HINT}`,
    );
  }
  const server = (
    serverUrl ||
    process.env.BWS_SERVER_URL ||
    DEFAULT_SM_SERVER
  ).replace(/\/$/, "");
  // Several projects are listed back to back, and SM answers 429 ("Slow
  // down! ... Try again in 1s") to bursts: wait and retry instead of failing.
  let result;
  for (let attempt = 0; ; attempt += 1) {
    result = spawnSync(
      bin,
      ["-t", token, "-u", server, "-o", "json", ...args],
      { encoding: "utf8", env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    if (result.status === 0) break;
    const detail = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    if (attempt < SM_MAX_RETRIES && isSmRateLimited(detail)) {
      sleepSync(smRetryDelayMs(attempt + 1));
      continue;
    }
    throw new Error(redactBwsFailure(detail) || `bws ${args.slice(0, 2).join(" ")} failed`);
  }
  const out = (result.stdout ?? "").trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

export const SM_TOKEN_HINT =
  "Run bw-unlock (the token is ARK_LOCAL_BW_TOKEN in the vault note ark/.env.local); CI sets BWS_ACCESS_TOKEN.";

/** Shell token first (CI, or an explicit override), else the unlocked vault. */
export function resolveSmAccessToken(env = process.env) {
  return (
    env.BWS_ACCESS_TOKEN?.trim() ||
    env.ARK_LOCAL_BW_TOKEN?.trim() ||
    env.ARK_CI_BW_TOKEN?.trim() ||
    (env.CI ? "" : vaultSmAccessToken())
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
  for (const [project, projectId] of Object.entries(resolveProjectIds({ accessToken, serverUrl }))) {
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
 * bws uses clap. A value that starts with "-" is parsed as a flag unless it is
 * attached with `--name=` or, for a positional, placed after `--`.
 * @param {string} name
 * @param {string} value
 */
export function bwsEqualsOpt(name, value) {
  return `--${name}=${value}`;
}

/** @returns {string[]} argv after the global bws flags */
export function secretCreateArgs(key, value, projectId, note) {
  const args = ["secret", "create"];
  if (note) args.push(bwsEqualsOpt("note", note));
  args.push(key, "--", value, projectId);
  return args;
}

/** @returns {string[]} */
export function secretEditArgs(id, value, note) {
  const args = ["secret", "edit", id, bwsEqualsOpt("value", value)];
  if (note) args.push(bwsEqualsOpt("note", note));
  return args;
}

/** Drop secret material that clap echoes back in a usage error. */
export function redactBwsFailure(detail) {
  return String(detail || "")
    .replace(/unexpected argument '[^']*'/g, "unexpected argument '[redacted]'")
    .replace(/to pass '[^']*' as a value, use '--[^\n]*/g, "to pass '[redacted]' as a value, use '--'")
    .trim();
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
  const projectId = resolveProjectIds({ accessToken, serverUrl })[owner];

  const entries = listSmSecretEntries({ accessToken, serverUrl, projectId });
  const existing = entries.get(trimmedKey);
  clearSecretsCache();
  if (existing?.id) {
    if (existing.value === trimmedValue) return "unchanged";
    runBws(secretEditArgs(existing.id, trimmedValue, note), { accessToken, serverUrl });
    return "updated";
  }
  runBws(secretCreateArgs(trimmedKey, trimmedValue, projectId, note), { accessToken, serverUrl });
  return "created";
}

/** Delete a secret by key from whichever project holds it. @returns {boolean} */
export function deleteSmSecretByKey({ key, accessToken, serverUrl } = {}) {
  const trimmedKey = String(key || "").trim();
  if (!trimmedKey) throw new Error("deleteSmSecretByKey requires key");
  for (const projectId of Object.values(resolveProjectIds({ accessToken, serverUrl }))) {
    const existing = listSmSecretEntries({ accessToken, serverUrl, projectId }).get(trimmedKey);
    if (!existing?.id) continue;
    clearSecretsCache();
    runBws(["secret", "delete", existing.id], { accessToken, serverUrl });
    return true;
  }
  return false;
}
