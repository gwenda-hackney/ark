#!/usr/bin/env node
/**
 * Ingest an LWC customer price-list CSV into ops/site/scripts/data/lwc-price-list.json
 * and patch the supplier links (Price / Pack / SKU) for matching codes, through
 * the menu repository (Baserow or D1, wherever the menu lives).
 *
 * Usage:
 *   npm run ingest:lwc-price-list -- [csv]
 *   npm run ingest:lwc-price-list -- --dry-run [csv]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseMoney,
  skuFromProductUrl,
} from "../src/inventory/suppliers.js";
import { diffLwcPriceLists, parseLwcPriceListCsv } from "../src/inventory/lwc-price-list.js";
import { menuRepository } from "../src/menu/server/menu-repository.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "scripts/data/lwc-price-list.json");
const defaultCsv = join(root, "scripts/data/lwc-gwenda-bar.csv");
const dryRun = process.argv.includes("--dry-run");
const csvArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function loadPrevious() {
  if (!existsSync(jsonPath)) return {};
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

function gbp(value) {
  const n = parseMoney(value);
  if (n == null) return "-";
  return `£${n.toFixed(2)}`;
}

async function patchLinks(bySku) {
  const repo = menuRepository(process.env);
  const [links, inventory] = await Promise.all([
    repo.list("inventory_suppliers"),
    repo.list("inventory"),
  ]);
  const inventoryName = new Map(
    inventory.map((record) => [record.id, text(record.name)]),
  );

  let patched = 0;
  let unchanged = 0;
  let unmatched = 0;
  const updates = [];
  const changes = [];

  for (const link of links) {
    const sku = (text(link.sku) || skuFromProductUrl(link.productUrl)).toUpperCase();
    if (!sku) {
      unmatched += 1;
      continue;
    }
    const hit = bySku[sku];
    if (!hit) {
      unmatched += 1;
      continue;
    }
    const fields = {};
    if (text(link.sku).toUpperCase() !== sku) fields.sku = sku;
    if (text(link.pack).toUpperCase() !== hit.pack) fields.pack = hit.pack;
    if (parseMoney(link.price) !== hit.price) fields.price = hit.price;
    if (!Object.keys(fields).length) {
      unchanged += 1;
      continue;
    }
    const label = inventoryName.get(link.inventoryId) || text(link.name) || sku;
    updates.push({
      sku,
      label,
      from: parseMoney(link.price),
      to: hit.price,
      pack: hit.pack,
    });
    changes.push({ op: "update", collection: "inventory_suppliers", id: link.id, fields });
    patched += 1;
  }
  if (!dryRun) await repo.write(changes);

  return { patched, unchanged, unmatched, updates };
}

async function main() {
  const csvPath = resolve(csvArg || defaultCsv);
  if (!existsSync(csvPath)) {
    console.error(`No CSV at ${csvPath}`);
    process.exit(1);
  }

  const next = parseLwcPriceListCsv(readFileSync(csvPath, "utf8"));
  const count = Object.keys(next).length;
  if (!count) {
    console.error("Parsed 0 SKUs. Check the CSV layout.");
    process.exit(1);
  }

  const previous = loadPrevious();
  const diff = diffLwcPriceLists(previous, next);
  if (!dryRun) {
    writeFileSync(jsonPath, `${JSON.stringify(next, null, 2)}\n`);
  }

  console.log(
    `${dryRun ? "Dry run: would write" : "Wrote"} ${count} SKU(s) → ${jsonPath}`,
  );
  console.log(
    `  + ${diff.added.length} added · ~ ${diff.changed.length} changed · − ${diff.removed.length} dropped`,
  );
  for (const row of diff.changed) {
    if (row.before.price === row.after.price) continue;
    console.log(
      `  ~ ${row.sku} ${row.after.name}: ${gbp(row.before.price)} → ${gbp(row.after.price)}`,
    );
  }

  const result = await patchLinks(next);
  console.log(
    `\n${dryRun ? "Dry run: would patch" : "Patched"} ${result.patched} inventory–supplier row(s); ${result.unchanged} already current; ${result.unmatched} with no list SKU.`,
  );
  for (const row of result.updates) {
    console.log(
      `  ✓ ${row.label} (${row.sku}) ${gbp(row.from)} → ${gbp(row.to)} / ${row.pack}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
