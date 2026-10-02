#!/usr/bin/env node
/**
 * Move every NAME__DEV and shared NAME secret from Ark, Ark/Ops and Ark/Web
 * (production) into Ark-Dev, Ark/Ops-Dev and Ark/Web-Dev, so the production
 * projects hold only NAME__PRODUCTION values and the dev CI token, which reads
 * only the -Dev projects, sees no production value (#61). Lists what it would
 * move; with --apply it copies each value, checks the copy, then deletes the
 * original. Safe to rerun: a key already in the -Dev project with the same
 * value is only removed from the production one.
 *
 * Needs bw-unlock (ark-local, read/write on all six projects).
 *
 *   npm run secrets:move-dev                # list
 *   npm run secrets:move-dev -- --apply     # move
 */
import { vaultSmAccessToken } from "./lib/bitwarden-env.mjs";
import {
  DEV_PROJECT_NAMES,
  PROJECT_NAMES,
  listSmSecretEntries,
  parseSecretKey,
  resolveDevProjectIds,
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
  const twins = resolveDevProjectIds(api);
  const missingTwins = Object.keys(sources).filter((owner) => !twins[owner]);
  if (missingTwins.length) {
    throw new Error(
      `Create these Secrets Manager projects first (and give ark-local read/write): ${missingTwins
        .map((owner) => `"${DEV_PROJECT_NAMES[owner]}"`)
        .join(", ")}. Names are matched ignoring case.`,
    );
  }

  let moved = 0;
  for (const [owner, sourceId] of Object.entries(sources)) {
    const source = listSmSecretEntries({ ...api, projectId: sourceId });
    const keys = [...source.keys()].filter((key) => parseSecretKey(key).env !== "production").sort();
    if (!keys.length) continue;
    const twin = listSmSecretEntries({ ...api, projectId: twins[owner] });
    for (const key of keys) {
      const { id, value } = source.get(key);
      const already = twin.get(key);
      if (already && already.value !== value) {
        throw new Error(`${key} is in both ${PROJECT_NAMES[owner]} and ${DEV_PROJECT_NAMES[owner]} with different values. Pick one by hand.`);
      }
      if (!APPLY) {
        console.log(`would move ${key}: ${PROJECT_NAMES[owner]} → ${DEV_PROJECT_NAMES[owner]}${already ? " (already copied)" : ""}`);
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
      console.log(`moved ${key}: ${PROJECT_NAMES[owner]} → ${DEV_PROJECT_NAMES[owner]}`);
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
