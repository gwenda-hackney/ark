#!/usr/bin/env node
/**
 * Move every NAME__PRODUCTION secret from Ark, Ark/Ops and Ark/Web into its
 * production twin (Ark (production) …), so the dev CI token, which can't read
 * the twins, sees no production value (#61). Lists what it would move; with
 * --apply it copies each value, checks the copy, then deletes the original.
 * Safe to rerun: a key already in the twin with the same value is only
 * removed from the original project.
 *
 * Needs bw-unlock (ark-local, read/write on all six projects).
 *
 *   node scripts/sm-move-production.mjs            # list
 *   node scripts/sm-move-production.mjs --apply    # move
 */
import { vaultSmAccessToken } from "./lib/bitwarden-env.mjs";
import {
  PRODUCTION_PROJECT_NAMES,
  listSmSecretEntries,
  parseSecretKey,
  resolveProductionProjectIds,
  resolveProjectIds,
  runBws,
  secretCreateArgs,
} from "./lib/bitwarden-sm.mjs";
import { clearSecretsCache } from "./lib/secrets-cache.mjs";

const APPLY = process.argv.includes("--apply");

function main() {
  const accessToken = vaultSmAccessToken();
  if (!accessToken) throw new Error("The vault is locked. Run bw-unlock first.");
  const api = { accessToken };
  const sources = resolveProjectIds(api);
  const twins = resolveProductionProjectIds(api);
  const missingTwins = Object.keys(sources).filter((owner) => !twins[owner]);
  if (missingTwins.length) {
    throw new Error(
      `Create these Secrets Manager projects first (and give ark-local read/write): ${missingTwins
        .map((owner) => `"${PRODUCTION_PROJECT_NAMES[owner]}"`)
        .join(", ")}. Names are matched ignoring case.`,
    );
  }

  let moved = 0;
  for (const [owner, sourceId] of Object.entries(sources)) {
    const source = listSmSecretEntries({ ...api, projectId: sourceId });
    const keys = [...source.keys()].filter((key) => parseSecretKey(key).env === "production").sort();
    if (!keys.length) continue;
    const twin = listSmSecretEntries({ ...api, projectId: twins[owner] });
    for (const key of keys) {
      const { id, value } = source.get(key);
      const already = twin.get(key);
      if (already && already.value !== value) {
        throw new Error(`${key} is in both ${owner} and its production twin with different values. Pick one by hand.`);
      }
      if (!APPLY) {
        console.log(`would move ${key}: ${owner} → ${PRODUCTION_PROJECT_NAMES[owner]}${already ? " (already copied)" : ""}`);
        continue;
      }
      if (!already) {
        runBws(secretCreateArgs(key, value, twins[owner]), api);
        const copy = listSmSecretEntries({ ...api, projectId: twins[owner] }).get(key);
        if (copy?.value !== value) throw new Error(`${key}: the copy doesn't match; original left in place.`);
      }
      runBws(["secret", "delete", id], api);
      clearSecretsCache();
      moved += 1;
      console.log(`moved ${key}: ${owner} → ${PRODUCTION_PROJECT_NAMES[owner]}`);
    }
  }
  console.log(APPLY ? `Moved ${moved} secret(s).` : "Dry run: nothing changed. Add --apply to move.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
