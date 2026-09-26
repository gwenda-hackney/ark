#!/usr/bin/env node
/**
 * Can this shell load local secrets? Reads the persisted bw session file, so
 * the answer is right even in a shell that never sourced ~/.bashrc (plain
 * `bw status` there says "locked" while the vault is unlocked).
 *
 *   npm run env:status
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { loadPersistedSession, readStatus, sessionFilePath } from "./lib/bitwarden-env.mjs";
import { secretsCacheDir } from "./lib/secrets-cache.mjs";

loadPersistedSession();
let status = "unknown";
try {
  status = readStatus().status;
} catch (error) {
  status = `bw failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`;
}
console.log(`Vault:   ${status} (session file ${sessionFilePath()})`);

try {
  const age = Math.round((Date.now() - statSync(join(secretsCacheDir(), "dev.json")).mtimeMs) / 60000);
  console.log(`Secrets: cached ${age} min ago in ${secretsCacheDir()}`);
} catch {
  console.log("Secrets: not cached (the next script fetches them)");
}

if (status !== "unlocked") {
  console.log("\nSecrets will not load. The user must run bw-unlock (it asks for the master password).");
  process.exit(1);
}
