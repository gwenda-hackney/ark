#!/usr/bin/env node
/**
 * Copy each series hero, and any night flyer, into that series Drive folder.
 * Run: node scripts/with-ops-env.mjs node ops/site/scripts/copy-series-heroes-to-drive.mjs
 */
import { copyStoredHeroesToDrive } from "../functions/_lib/event-store.js";

const { copied, skipped } = await copyStoredHeroesToDrive(process.env);
for (const row of copied) {
  const when = row.date ? ` ${row.date}` : "";
  console.log(`${row.kind}${when}: ${row.name}`);
}
for (const row of skipped) {
  console.log(`skipped ${row.name}: ${row.reason}`);
}
console.log(`Copied ${copied.length} hero image${copied.length === 1 ? "" : "s"}.`);
