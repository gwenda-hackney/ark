/**
 * Shared Bitwarden helpers for ark env vault items.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { parseDotEnv } from "../../marketing/web/functions/_lib/env-pem.js";

export const DEFAULT_SERVER = "https://vault.bitwarden.eu";
export const DEFAULT_LOCAL_ITEM = "ark/.env.local";
export const ARK_FOLDER_NAME = "ark";
export const DEFAULT_CONTAINER_SESSION_FILE = "/commandhistory/.bw-session";

const UNLOCK_HINT = "  bw-unlock   # or: export BW_SESSION=$(bw unlock --raw)";

export const ENV_ITEMS = {
  local: "ark/.env.local",
  staging: "ark/.env.staging",
  production: "ark/.env.production",
};

export function runBw(args, { input, quiet = true } = {}) {
  const result = spawnSync("bw", args, {
    input,
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || `bw ${args.join(" ")} failed`);
  }

  return quiet ? (result.stdout ?? "").trimEnd() : result.stdout ?? "";
}

export function ensureBwInstalled() {
  const result = spawnSync("bw", ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      "Bitwarden CLI (`bw`) not found.\n" +
        "  Devcontainer: rebuild so Dockerfile installs @bitwarden/cli\n" +
        "  Host: npm install -g @bitwarden/cli",
    );
  }
}

export function ensureServer() {
  const wanted = (process.env.BW_SERVER?.trim() || DEFAULT_SERVER).replace(/\/$/, "");
  let current = "";
  try {
    current = runBw(["config", "server"]).trim().replace(/\/$/, "");
  } catch {
    current = "";
  }
  if (current !== wanted) {
    console.log(`Configuring Bitwarden server → ${wanted}`);
    runBw(["config", "server", wanted]);
  }
}

export function readStatus() {
  return JSON.parse(runBw(["status"]));
}

/** Session key file so unlock survives new shells / agent processes. */
export function sessionFilePath() {
  const override = process.env.BW_SESSION_FILE?.trim();
  if (override) return override;
  if (existsSync("/commandhistory")) return DEFAULT_CONTAINER_SESSION_FILE;
  return `${homedir()}/.bw-session`;
}

export function loadPersistedSession() {
  if (process.env.BW_SESSION?.trim()) return;
  try {
    const session = readFileSync(sessionFilePath(), "utf8").replace(/[\n\r]+/g, "").trim();
    if (session) process.env.BW_SESSION = session;
  } catch {
    // missing or unreadable
  }
}

export function persistSession(session = process.env.BW_SESSION) {
  const key = String(session ?? "").trim();
  if (!key) return;
  process.env.BW_SESSION = key;
  const path = sessionFilePath();
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`Could not persist Bitwarden session to ${path}: ${detail}`);
  }
}

export function clearPersistedSession() {
  delete process.env.BW_SESSION;
  try {
    unlinkSync(sessionFilePath());
  } catch {
    // already gone
  }
}

export function ensureSession() {
  loadPersistedSession();
  const status = readStatus();

  if (status.status === "unauthenticated") {
    throw new Error(
      "Bitwarden CLI is not logged in.\n" +
        `  bw config server ${DEFAULT_SERVER}\n` +
        "  bw login\n" +
        UNLOCK_HINT,
    );
  }

  if (status.status === "unlocked") {
    persistSession();
    return;
  }

  if (status.status !== "locked") {
    throw new Error(`Unexpected Bitwarden status: ${status.status}`);
  }

  // Stale session file / env: drop it so unlock can mint a new key.
  if (process.env.BW_SESSION) {
    clearPersistedSession();
  }

  if (process.env.BW_PASSWORD) {
    const session = runBw(["unlock", "--passwordenv", "BW_PASSWORD", "--raw"]);
    persistSession(session);
    console.log("Unlocked vault (BW_PASSWORD).");
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "Bitwarden vault is locked.\n" +
        `${UNLOCK_HINT}\n` +
        "  then re-run the command (session persists for this container)",
    );
  }

  console.log("Vault locked. Enter your Bitwarden master password.");
  const unlock = spawnSync("bw", ["unlock", "--raw"], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    env: process.env,
  });
  if (unlock.status !== 0) {
    throw new Error((unlock.stderr || "").trim() || "bw unlock failed");
  }
  persistSession(unlock.stdout);
  console.log("Unlocked vault.");
}

export function syncVault() {
  console.log("Syncing vault…");
  runBw(["sync"]);
}

export function getItemOrNull(itemName) {
  try {
    return JSON.parse(runBw(["get", "item", itemName]));
  } catch {
    return null;
  }
}

export function secretsFromItem(item) {
  const map = new Map();
  const notes = typeof item.notes === "string" ? item.notes : "";
  for (const [key, value] of parseDotEnv(notes)) {
    if (value !== "") map.set(key, value);
  }
  for (const field of item.fields ?? []) {
    const name = String(field?.name ?? "").trim();
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    const value = field.value == null ? "" : String(field.value);
    if (value !== "") map.set(name, value);
  }
  return { map, notes };
}

export function serializeEnvValue(value) {
  if (/[\n\r#]/.test(value) || /^\s|\s$/.test(value) || /[\s"'`]/.test(value)) {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }
  return value;
}

/** Set or insert KEY=value in a dotenv notes body; preserve comments/order. */
export function upsertDotEnvKey(notes, key, value) {
  const serialized = `${key}=${serializeEnvValue(value)}`;
  const lines = (notes || "").split("\n");
  let found = false;
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    if (trimmed.slice(0, eq).trim() !== key) return line;
    found = true;
    const prefix = line.slice(0, line.indexOf(key));
    return `${prefix}${serialized}`;
  });
  if (!found) {
    const body = next.join("\n").replace(/\n+$/, "");
    return `${body}${body ? "\n" : ""}${serialized}\n`;
  }
  return `${next.join("\n").replace(/\n+$/, "")}\n`;
}

export function applySecretsToTemplate(template, secrets) {
  const seen = new Set();
  const lines = template.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (!secrets.has(key)) return line;
    seen.add(key);
    const prefix = line.slice(0, line.indexOf(key));
    return `${prefix}${key}=${serializeEnvValue(secrets.get(key))}`;
  });

  const missing = [...secrets.keys()].filter((key) => !seen.has(key));
  if (missing.length === 0) {
    return { content: `${lines.join("\n").replace(/\n+$/, "")}\n`, filled: seen.size, appended: 0 };
  }

  const block = [
    "",
    "# ── From Bitwarden (keys not in template) ──",
    ...missing.map((key) => `${key}=${serializeEnvValue(secrets.get(key))}`),
    "",
  ].join("\n");

  return {
    content: `${lines.join("\n").replace(/\n+$/, "")}\n${block}`,
    filled: seen.size,
    appended: missing.length,
  };
}

export function createSecureNote(name, notes, { folderId = null } = {}) {
  const template = JSON.parse(runBw(["get", "template", "item"]));
  template.type = 2; // Secure Note
  template.name = name;
  template.notes = notes.endsWith("\n") ? notes : `${notes}\n`;
  template.folderId = folderId;
  template.secureNote = { type: 0 };
  template.login = null;
  template.card = null;
  template.identity = null;
  template.fields = [];
  template.passwordHistory = [];

  const encoded = runBw(["encode"], { input: JSON.stringify(template) });
  const created = JSON.parse(runBw(["create", "item", encoded]));
  return created;
}

export function updateItemNotes(item, notes) {
  const next = { ...item, notes: notes.endsWith("\n") ? notes : `${notes}\n` };
  const encoded = runBw(["encode"], { input: JSON.stringify(next) });
  return JSON.parse(runBw(["edit", "item", item.id, encoded]));
}

/** Ensure the personal vault folder exists; return its id. */
export function ensureFolder(folderName = ARK_FOLDER_NAME) {
  const folders = JSON.parse(runBw(["list", "folders"]));
  const existing = folders.find(
    (folder) => String(folder.name || "").trim() === folderName,
  );
  if (existing?.id) return existing.id;

  const template = JSON.parse(runBw(["get", "template", "folder"]));
  template.name = folderName;
  const encoded = runBw(["encode"], { input: JSON.stringify(template) });
  const created = JSON.parse(runBw(["create", "folder", encoded]));
  console.log(`Created Bitwarden folder "${folderName}" (${created.id}).`);
  return created.id;
}

/** Move an item into a folder if it is not already there. */
export function ensureItemInFolder(item, folderId) {
  if (!item?.id || !folderId) return item;
  if (item.folderId === folderId) return item;
  const next = { ...item, folderId };
  const encoded = runBw(["encode"], { input: JSON.stringify(next) });
  const updated = JSON.parse(runBw(["edit", "item", item.id, encoded]));
  console.log(`Moved "${item.name}" into folder id ${folderId}.`);
  return updated;
}
