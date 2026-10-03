/**
 * The Bitwarden Password Manager side of local secrets: the unlocked session
 * (`bw-unlock` is the login) and the one vault note, `ark/.env.local`, that
 * holds the Secrets Manager machine token. App secrets themselves live in
 * Secrets Manager (scripts/lib/bitwarden-sm.mjs) and load in memory
 * (scripts/lib/load-env.mjs).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseDotEnv } from "../../shared/env-file.js";
import { secretsCacheDir } from "./secrets-cache.mjs";

const VAULT_NOTE = "ark/.env.local";
/** Where older containers kept the session, on disk. Moved into RAM on first read. */
const LEGACY_SESSION_FILE = "/commandhistory/.bw-session";

/**
 * Keys that stay in the vault note and never land in `.env`. ARK_LOCAL_BW_TOKEN
 * opens every local secret, so it is read from the unlocked vault when needed.
 */
export const VAULT_ONLY_KEYS = ["ARK_LOCAL_BW_TOKEN"];

function runBw(args) {
  const result = spawnSync("bw", args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || `bw ${args.join(" ")} failed`);
  }
  return (result.stdout ?? "").trimEnd();
}

export function readStatus() {
  return JSON.parse(runBw(["status"]));
}

/**
 * Session key file so unlock survives new shells / agent processes. In RAM next
 * to the secrets cache (.devcontainer/bw-session.bashrc writes it), so it is
 * gone when the container stops.
 */
export function sessionFilePath() {
  const override = process.env.BW_SESSION_FILE?.trim();
  // Shells started under the old snippet still export the on-disk path.
  if (override && override !== LEGACY_SESSION_FILE) return override;
  return join(secretsCacheDir(), "bw-session");
}

function moveLegacySession(path) {
  if (existsSync(path) || !existsSync(LEGACY_SESSION_FILE)) return;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, readFileSync(LEGACY_SESSION_FILE), { mode: 0o600 });
    rmSync(LEGACY_SESSION_FILE, { force: true });
  } catch {
    // unreadable or not ours: the shell snippet moves it instead
  }
}

/** Use the session `bw-unlock` saved, even in a shell that never exported it. */
export function loadPersistedSession() {
  if (process.env.BW_SESSION?.trim()) return;
  moveLegacySession(sessionFilePath());
  try {
    const session = readFileSync(sessionFilePath(), "utf8").replace(/[\n\r]+/g, "").trim();
    if (session) process.env.BW_SESSION = session;
  } catch {
    // missing or unreadable
  }
}

/**
 * When a person runs a script at a terminal and the vault is locked, ask for
 * the master password there and save the session as `bw-unlock` does. Agents
 * and CI have no terminal, so they get the "vault locked" warning instead of a
 * prompt that would hang.
 * @returns {boolean} whether the vault is now unlocked
 */
export function promptUnlock() {
  if (process.env.CI || !process.stdin.isTTY || !process.stderr.isTTY) return false;
  try {
    if (readStatus().status !== "locked") return false;
  } catch {
    return false; // no bw: callers explain
  }
  console.error("Bitwarden vault is locked. Unlock it to load secrets (same as bw-unlock).");
  // bw prompts on stderr, so stdout carries only the session key.
  const result = spawnSync("bw", ["unlock", "--raw"], {
    encoding: "utf8",
    env: process.env,
    stdio: ["inherit", "pipe", "inherit"],
  });
  const session = result.status === 0 ? (result.stdout ?? "").trim() : "";
  if (!session) return false;
  process.env.BW_SESSION = session;
  const path = sessionFilePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${session}\n`, { mode: 0o600 });
  vaultToken = undefined;
  return true;
}

let vaultToken;

/**
 * The Secrets Manager token from the vault note, or "" when `bw` is missing or
 * locked. Never prompts; `bw-unlock` is the login.
 */
export function vaultSmAccessToken() {
  if (vaultToken !== undefined) return vaultToken;
  vaultToken = "";
  loadPersistedSession();
  if (!process.env.BW_SESSION) return vaultToken;
  try {
    const item = JSON.parse(runBw(["get", "item", VAULT_NOTE, "--nointeraction"]));
    const notes = new Map(parseDotEnv(typeof item.notes === "string" ? item.notes : ""));
    vaultToken = notes.get("ARK_LOCAL_BW_TOKEN")?.trim() || "";
  } catch {
    // locked, logged out or no bw: callers explain
  }
  return vaultToken;
}
