#!/usr/bin/env node
/**
 * Postmix bag-in-box lines → Ops inventory (10 L BIBs).
 *
 * Sellable soft-drink buttons already live in Lightspeed (pint / half).
 * This stamps supplier pack cost onto mixer / juice stock used for recipes
 * and creates Diet Coke + Sunkist Lemonade if missing.
 *
 * First line on the invoice had no product code visible; treated as Coca-Cola
 * Classic 10 L BB at £99.26.
 *
 *   node scripts/with-ops-env.mjs node scripts/ops-sync-postmix-invoice.mjs
 */
import { OPS_PRODUCTION_DATABASE_ID } from "../ops/site/functions/_lib/baserow.js";
import {
  createInventoryItem,
  listInventory,
  updateInventoryItem,
} from "../ops/site/functions/_lib/inventory-store.js";
import { namesClash } from "../ops/site/functions/_lib/item-key.js";

const SUPPLIER = "D&L";

const LINES = [
  {
    sku: "",
    name: "Coca-Cola",
    kind: "mixer",
    pack: "BIB10L",
    price: 99.26,
    matchNames: ["Coca-Cola", "Coke"],
  },
  {
    sku: "20000119",
    name: "Diet Coke",
    kind: "mixer",
    pack: "BIB10L",
    price: 83.9,
    matchNames: ["Diet Coke", "Diet Coca-Cola"],
  },
  {
    sku: "10000044",
    name: "Sunkist Lemonade",
    kind: "mixer",
    pack: "BIB10L",
    price: 47.89,
    matchNames: ["Sunkist Lemonade", "Lemonade"],
  },
  {
    sku: "10000047",
    name: "Tonic water",
    kind: "mixer",
    pack: "BIB10L",
    price: 48.86,
    matchNames: ["Tonic water", "Tonic"],
  },
  {
    sku: "10000052",
    name: "Ginger beer",
    kind: "mixer",
    pack: "BIB10L",
    price: 55.76,
    matchNames: ["Ginger beer", "Old Jamaica Ginger Beer"],
  },
  {
    sku: "",
    name: "Orange juice",
    kind: "juice",
    pack: "BIB10L",
    price: 58.92,
    matchNames: ["Orange juice", "Orange Juice Drink"],
  },
];

function envFromProcess() {
  return { ...process.env };
}

function findItem(items, line) {
  const sku = String(line.sku || "")
    .trim()
    .toUpperCase();
  if (sku) {
    const bySku = items.find((item) =>
      (item.suppliers || []).some(
        (row) => String(row.sku || "").trim().toUpperCase() === sku,
      ),
    );
    if (bySku) return bySku;
  }
  const names = [line.name, ...(line.matchNames || [])];
  return items.find((item) =>
    names.some((name) => namesClash(item.name, name)),
  );
}

function supplierLink(line) {
  return {
    name: SUPPLIER,
    sku: line.sku || undefined,
    pack: line.pack,
    price: line.price,
  };
}

function mergeSuppliers(item, link) {
  const sku = String(link.sku || "")
    .trim()
    .toUpperCase();
  const existing = item?.suppliers || [];
  const rest = existing.filter((row) => {
    const name = String(row.name || "")
      .trim()
      .toLowerCase();
    const pack = String(row.pack || "")
      .trim()
      .toUpperCase();
    // Postmix BIBs are D&L London, not Sysco / Brakes.
    if (name === "sysco" && pack.startsWith("BIB")) return false;
    if (sku && String(row.sku || "").trim().toUpperCase() === sku) return false;
    if (
      !sku &&
      name === SUPPLIER.toLowerCase() &&
      String(row.pack || "") === link.pack
    ) {
      return false;
    }
    return true;
  });
  return [...rest, link];
}

async function main() {
  const env = envFromProcess();
  const dbId = String(env.BASEROW_OPS_DATABASE_ID || "").trim();
  if (!env.BASEROW_API_KEY) throw new Error("Need BASEROW_API_KEY.");
  if (!dbId) throw new Error("BASEROW_OPS_DATABASE_ID is missing.");
  if (dbId === OPS_PRODUCTION_DATABASE_ID) {
    throw new Error("Refusing to write production Ops. Point at the clone.");
  }
  console.log(`Using BASEROW_OPS_DATABASE_ID=${dbId}`);

  const created = [];
  const updated = [];

  for (const line of LINES) {
    const items = await listInventory(env, { includeInactive: true });
    const hit = findItem(items, line);
    const link = supplierLink(line);
    if (!hit) {
      const item = await createInventoryItem(env, {
        name: line.name,
        kind: line.kind,
        defaultUnit: "ml",
        estimatedCost: line.price,
        active: true,
        suppliers: [link],
      });
      created.push(`${item.name} @ £${line.price} (${line.pack})`);
      continue;
    }
    await updateInventoryItem(env, hit._id, {
      active: true,
      estimatedCost: line.price,
      suppliers: mergeSuppliers(hit, link),
    });
    updated.push(`${hit.name} @ £${line.price} (${line.sku || "no code"})`);
  }

  console.log(`Created ${created.length}:`);
  for (const row of created) console.log(`  + ${row}`);
  console.log(`Updated ${updated.length}:`);
  for (const row of updated) console.log(`  ~ ${row}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
