/**
 * Baserow user JWT for schema scripts (create tables/fields).
 *
 * Database tokens cannot do that. After the first email/password login we
 * cache access + refresh tokens in `.baserow-jwt.json` (gitignored) and reuse
 * them for the rest of the Docker/session. Password is never written.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE_PATH = join(ROOT, ".baserow-jwt.json");
const SKEW_SEC = 60;

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function jwtExp(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function isFresh(token) {
  const exp = jwtExp(token);
  if (exp == null) return Boolean(token);
  return exp - SKEW_SEC > Date.now() / 1000;
}

function readCache(apiBase) {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    if (raw.apiBase && raw.apiBase !== apiBase) return null;
    const envEmail = readEnv("BASEROW_JWT_EMAIL").toLowerCase();
    if (envEmail && raw.email && String(raw.email).toLowerCase() !== envEmail) {
      return null;
    }
    return {
      apiBase: raw.apiBase || apiBase,
      email: typeof raw.email === "string" ? raw.email : "",
      accessToken: raw.accessToken || raw.token || "",
      refreshToken: raw.refreshToken || "",
    };
  } catch {
    return null;
  }
}

function writeCache(apiBase, email, tokens) {
  const body = {
    apiBase,
    email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(CACHE_PATH, 0o600);
  } catch {
    /* ignore */
  }
}

function promptHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let password = "";
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(password);
        return;
      }
      if (char === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        process.exit(130);
      }
      if (char === "\u007f") {
        if (password.length > 0) password = password.slice(0, -1);
        return;
      }
      password += char;
    };
    stdin.on("data", onData);
  });
}

async function promptCredentials(hint) {
  let email = readEnv("BASEROW_JWT_EMAIL");
  let password = readEnv("BASEROW_JWT_PASSWORD");
  if (email && password) return { email, password };

  if (!stdin.isTTY) {
    throw new Error(
      "Set BASEROW_JWT_EMAIL and BASEROW_JWT_PASSWORD for non-interactive use.",
    );
  }

  const where = hint ? ` (${hint})` : "";
  console.log(`Log in with your Baserow account (Admin or Builder${where}).`);
  console.log("Password is not saved. JWT is cached in .baserow-jwt.json.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (!email) email = (await rl.question("Baserow email: ")).trim();
  } finally {
    rl.close();
  }
  if (!password) password = await promptHidden("Baserow password: ");
  if (!email || !password) throw new Error("Email and password are required.");
  return { email, password };
}

function tokensFromPayload(payload) {
  const accessToken = payload.access_token || payload.token || "";
  const refreshToken = payload.refresh_token || "";
  if (!accessToken) {
    throw new Error("Baserow login succeeded but no access_token.");
  }
  return { accessToken, refreshToken };
}

async function login(apiBase, email, password) {
  const response = await fetch(`${apiBase}/api/user/token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Baserow login failed (${response.status}): ${payload.detail || payload.error || "check email/password"}`,
    );
  }
  return tokensFromPayload(payload);
}

async function refresh(apiBase, refreshToken) {
  const response = await fetch(`${apiBase}/api/user/token-refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  try {
    return tokensFromPayload(payload);
  } catch {
    return null;
  }
}

/**
 * Return a user JWT, from cache / refresh / env / prompt.
 * @param {string} apiBase
 * @param {{ hint?: string }} [opts]
 */
export async function getBaserowJwt(apiBase, opts = {}) {
  const base = String(apiBase || "https://api.baserow.io").replace(/\/$/, "");
  const cached = readCache(base);

  if (cached?.accessToken && isFresh(cached.accessToken)) {
    console.log(
      `Using cached Baserow JWT${cached.email ? ` (${cached.email})` : ""}.`,
    );
    return cached.accessToken;
  }

  if (cached?.refreshToken) {
    const next = await refresh(base, cached.refreshToken);
    if (next) {
      writeCache(base, cached.email, {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken || cached.refreshToken,
      });
      console.log(
        `Refreshed Baserow JWT${cached.email ? ` (${cached.email})` : ""}.`,
      );
      return next.accessToken;
    }
  }

  const { email, password } = await promptCredentials(opts.hint);
  console.log(`Authenticating with Baserow (${base})…`);
  const tokens = await login(base, email, password);
  writeCache(base, email, tokens);
  return tokens.accessToken;
}
