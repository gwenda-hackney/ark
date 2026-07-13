#!/usr/bin/env node
/**
 * Generate EVENT_ADMIN_SECRET and print env lines for repo-root .env.
 *
 * Usage: npm run setup:event-admin
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env");

const secret = randomBytes(32).toString("hex");

let envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

function upsertEnv(name, value) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(envText)) {
    envText = envText.replace(re, line);
  } else {
    envText = `${envText.trimEnd()}\n${line}\n`;
  }
}

upsertEnv("EVENT_ADMIN_SECRET", secret);

writeFileSync(envPath, envText.endsWith("\n") ? envText : `${envText}\n`, "utf8");

console.log("Updated repo-root .env with EVENT_ADMIN_SECRET.");
console.log("");
console.log("Add to repo-root .env if not already set:");
console.log("EVENT_ADMIN_URL=http://localhost:4321   # local Studio + npm run dev");
console.log("# EVENT_ADMIN_URL=https://gwenda-staging.pages.dev  # hosted dev Studio");
console.log("# EVENT_ADMIN_URL=https://gwenda.co.uk              # production Studio");
console.log("");
console.log("Set EVENT_ADMIN_SECRET as a GitHub secret for site + Studio deploy workflows.");
