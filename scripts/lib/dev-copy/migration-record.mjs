/**
 * After a copy, dev's record of which deploy migrations have run
 * (scripts/lib/migration-record.mjs) becomes production's: dev's data is now
 * production's, so a migration dev ran but production hasn't must run on it
 * again at dev's next deploy. Production is only read.
 */
import { D1_DATABASES } from "../../../shared/d1-databases.js";
import { d1Http } from "../../../shared/d1-http.js";
import { cloudflareFor } from "../bitwarden-sm.mjs";
import { migrationRecord } from "../migration-record.mjs";

function configDatabase(env) {
  const { token, accountId } = cloudflareFor(env);
  return d1Http({ accountId, databaseId: D1_DATABASES[env].config.id, token });
}

/** @param {{ dryRun?: boolean, from?: any, to?: any, log?: (line: string) => void }} [opts] */
export async function copyMigrationRecord({
  dryRun = false,
  from,
  to,
  log = console.log,
} = {}) {
  const production = migrationRecord(from ?? configDatabase("production"));
  const dev = migrationRecord(to ?? configDatabase("dev"));
  const rows = await production.rows();
  const devRan = await dev.ran();
  const again = [...devRan].filter(
    (name) => !rows.some((row) => row.name === name),
  );
  if (!dryRun) await dev.replaceWith(rows);
  log(
    `${dryRun ? "Would take" : "Took"} production's record: ${rows.length} migrations ran there.` +
      (again.length
        ? ` Dev's next deploy runs again: ${again.join(", ")}.`
        : ""),
  );
}
