#!/usr/bin/env node
/**
 * Export named Secrets Manager keys into a GitHub Actions job, masked.
 * For script credentials that no app runtime gets (so they stay out of the
 * app manifests in scripts/lib/bitwarden-sm.mjs).
 *
 *   node scripts/sm-export.mjs BASEROW_JWT_EMAIL BASEROW_JWT_PASSWORD
 *
 * `NAME__PRODUCTION` wins over `NAME`. Fails, naming the key, if one is missing.
 */
import { appendFileSync } from "node:fs";
import {
  ensureBwsInstalled,
  listAllSmSecrets,
  resolveSecretsForEnv,
  resolveSmAccessToken,
} from "./lib/bitwarden-sm.mjs";

const names = process.argv.slice(2).filter((arg) => /^[A-Z0-9_]+$/.test(arg));
if (!names.length) {
  console.error("Usage: node scripts/sm-export.mjs NAME [NAME...]");
  process.exit(2);
}
const path = process.env.GITHUB_ENV?.trim();
if (!path) {
  console.error("GITHUB_ENV is not set; this script only runs in GitHub Actions.");
  process.exit(2);
}

ensureBwsInstalled();
const resolved = resolveSecretsForEnv(
  listAllSmSecrets({ accessToken: resolveSmAccessToken() }),
  "production",
);
const missing = names.filter((name) => !String(resolved.get(name) ?? "").trim());
if (missing.length) {
  console.error(
    `Missing in Bitwarden Secrets Manager: ${missing.join(", ")}. Add them (ops project) and re-run.`,
  );
  process.exit(1);
}
for (const name of names) {
  const value = String(resolved.get(name));
  for (const line of value.split("\n")) if (line.trim()) process.stdout.write(`::add-mask::${line}\n`);
  appendFileSync(path, `${name}<<SM_EOF\n${value}\nSM_EOF\n`);
}
console.log(`Exported ${names.join(", ")}.`);
