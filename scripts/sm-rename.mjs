#!/usr/bin/env node
/**
 * Rename a Secrets Manager secret, for example when a shared NAME becomes
 * NAME__PRODUCTION. The new key goes to the project its name belongs to (a
 * __PRODUCTION name to the production project, any other to its -dev
 * project). Says what it would do; with --apply it copies the value, checks
 * the copy, then deletes the old key. Safe to rerun. Never prints values.
 *
 * Needs bw-unlock (ark-local, read/write on all six projects).
 *
 *   npm run secrets:rename -- OLD_NAME NEW_NAME             # show
 *   npm run secrets:rename -- OLD_NAME NEW_NAME --apply     # rename
 */
import { vaultSmAccessToken } from "./lib/bitwarden-env.mjs";
import {
  deleteSmSecretByKey,
  listAllSmSecrets,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

const [from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const APPLY = process.argv.includes("--apply");

function main() {
  if (!from || !to || from === to)
    throw new Error("Usage: secrets:rename -- OLD_NAME NEW_NAME [--apply]");
  const accessToken = vaultSmAccessToken();
  if (!accessToken)
    throw new Error("The vault is locked. Run bw-unlock first.");
  const secrets = listAllSmSecrets({ accessToken });
  const value = secrets.get(from);
  const existing = secrets.get(to);
  if (!value) {
    if (existing)
      return console.log(`${from} is gone and ${to} exists: already renamed.`);
    throw new Error(`${from} not found in Secrets Manager.`);
  }
  if (existing && existing !== value) {
    throw new Error(
      `${to} already exists with a different value. Delete one of them first.`,
    );
  }
  if (!APPLY)
    return console.log(`Would rename ${from} → ${to}. Run again with --apply.`);
  if (!existing) upsertSmSecret({ key: to, value, accessToken });
  if (listAllSmSecrets({ accessToken }).get(to) !== value) {
    throw new Error(`${to} didn't read back the same value; ${from} kept.`);
  }
  deleteSmSecretByKey({ key: from, accessToken });
  console.log(`Renamed ${from} → ${to}.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
