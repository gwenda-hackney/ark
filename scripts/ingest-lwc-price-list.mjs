#!/usr/bin/env node
/**
 * Ingest an LWC customer price-list CSV into scripts/data/lwc-price-list.json
 * and patch Baserow Inventory suppliers (Price / Pack / SKU) for matching codes.
 *
 * Usage:
 *   node scripts/with-ops-env.mjs node scripts/ingest-lwc-price-list.mjs [csv]
 *   node scripts/with-ops-env.mjs node scripts/ingest-lwc-price-list.mjs --dry-run [csv]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listAllRows, updateRow } from "../ops/site/src/platform/baserow.js";
import {
  parseMoney,
  skuFromProductUrl,
} from "../ops/site/src/features/inventory/suppliers.js";
import { diffLwcPriceLists, parseLwcPriceListCsv } from "./lib/lwc-price-list.mjs";
import { requireOpsTables } from "./lib/ops-baserow-tables.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "scripts/data/lwc-price-list.json");
const defaultCsv = join(root, "scripts/data/lwc-gwenda-bar.csv");
const dryRun = process.argv.includes("--dry-run");
const csvArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function linkId(value) {
  if (Array.isArray(value) && value[0]) {
    const first = value[0];
    if (typeof first === "number") return first;
    if (first && typeof first === "object" && first.id != null) return Number(first.id);
  }
  return null;
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

async function patchBaserow(bySku) {
  const tables = await requireOpsTables();
  if (!tables.inventorySuppliers) {
    throw new Error("Missing Inventory suppliers table. Run npm run setup:baserow-ops.");
  }
  const [linkRows, inventoryRows] = await Promise.all([
    listAllRows(process.env, tables.inventorySuppliers),
    tables.inventory ? listAllRows(process.env, tables.inventory) : [],
  ]);
  const inventoryName = new Map(
    inventoryRows.map((row) => [row.id, text(row.Name)]),
  );

  let patched = 0;
  let unchanged = 0;
  let unmatched = 0;
  const updates = [];

  for (const row of linkRows) {
    const sku = (text(row.SKU) || skuFromProductUrl(row["Product URL"])).toUpperCase();
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
    if (text(row.SKU).toUpperCase() !== sku) fields.SKU = sku;
    if (text(row.Pack).toUpperCase() !== hit.pack) fields.Pack = hit.pack;
    if (parseMoney(row.Price) !== hit.price) fields.Price = hit.price;
    if (!Object.keys(fields).length) {
      unchanged += 1;
      continue;
    }
    const label = inventoryName.get(linkId(row.Inventory)) || text(row.Name) || sku;
    updates.push({
      sku,
      label,
      from: parseMoney(row.Price),
      to: hit.price,
      pack: hit.pack,
    });
    if (!dryRun) {
      await updateRow(process.env, tables.inventorySuppliers, row.id, fields);
    }
    patched += 1;
  }

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

  const result = await patchBaserow(next);
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
