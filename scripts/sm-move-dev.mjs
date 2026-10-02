#!/usr/bin/env node
/**
 * Move every NAME__DEV and shared NAME secret from Ark, Ark/Ops and Ark/Web
 * (production) into Ark-Dev, Ark/Ops-Dev and Ark/Web-Dev, so the production
 * projects hold only NAME__PRODUCTION values and the dev CI token, which reads
 * only the -Dev projects, sees no production value (#61). Lists what it would
 * move; with --apply it copies each value, checks the copy, then deletes the
 * original. Production-only names (PRODUCTION_ONLY) go the other way: a shared
 * NAME becomes NAME__PRODUCTION in the production project. Safe to rerun: a
 * key already copied with the same value is only removed from where it was.
 *
 * Needs bw-unlock (ark-local, read/write on all six projects).
 *
 *   npm run secrets:move-dev                # list
 *   npm run secrets:move-dev -- --apply     # move
 */
import { vaultSmAccessToken } from "./lib/bitwarden-env.mjs";
import {
  DEV_PROJECT_NAMES,
  PRODUCTION_ONLY,
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
  /** Copy `fromKey` into project `toId` as `toKey`, check it, delete the original. */
  const move = ({ from, fromLabel, fromKey, to, toLabel, toKey }) => {
    const { id, value } = from.get(fromKey);
    const already = listSmSecretEntries({ ...api, projectId: to }).get(toKey);
    if (already && already.value !== value) {
      throw new Error(`${fromKey} (${fromLabel}) and ${toKey} (${toLabel}) have different values. Pick one by hand.`);
    }
    const what = `${fromKey} (${fromLabel}) → ${toKey} (${toLabel})`;
    if (!APPLY) {
      console.log(`would move ${what}${already ? ", already copied" : ""}`);
      return;
    }
    if (!already) {
      runBws(secretCreateArgs(toKey, value, to), api);
      const copy = listSmSecretEntries({ ...api, projectId: to }).get(toKey);
      if (copy?.value !== value) throw new Error(`${toKey}: the copy doesn't match; original left in place.`);
    }
    runBws(["secret", "delete", id], api);
    clearSecretsCache();
    moved += 1;
    console.log(`moved ${what}`);
  };

  for (const [owner, productionId] of Object.entries(sources)) {
    const production = listSmSecretEntries({ ...api, projectId: productionId });
    const dev = listSmSecretEntries({ ...api, projectId: twins[owner] });
    const labels = { production: PROJECT_NAMES[owner], dev: DEV_PROJECT_NAMES[owner] };
    // Dev and shared values out of the production project.
    for (const key of [...production.keys()].sort()) {
      if (parseSecretKey(key).env === "production") continue;
      const productionOnly = PRODUCTION_ONLY.includes(key);
      move({
        from: production,
        fromLabel: labels.production,
        fromKey: key,
        to: productionOnly ? productionId : twins[owner],
        toLabel: productionOnly ? labels.production : labels.dev,
        toKey: productionOnly ? `${key}__PRODUCTION` : key,
      });
    }
    // Production-only names stored shared in the dev project: back to production.
    for (const key of [...dev.keys()].sort()) {
      if (!PRODUCTION_ONLY.includes(key)) continue;
      move({ from: dev, fromLabel: labels.dev, fromKey: key, to: productionId, toLabel: labels.production, toKey: `${key}__PRODUCTION` });
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
