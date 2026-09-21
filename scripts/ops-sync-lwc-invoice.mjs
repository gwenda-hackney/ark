#!/usr/bin/env node
/**
 * Ensure LWC / Hills Prospect invoice lines exist in Ops inventory.
 *
 * Invoice 1266652, 18 Sep 2026 (Report 151-21092026-1000.pdf).
 * Skips transport tariff. Matches by supplier SKU, then by inventory name.
 *
 *   node scripts/with-ops-env.mjs node scripts/ops-sync-lwc-invoice.mjs
 */
import { OPS_PRODUCTION_DATABASE_ID } from "../ops/site/functions/_lib/baserow.js";
import {
  createInventoryItem,
  listInventory,
  updateInventoryItem,
} from "../ops/site/functions/_lib/inventory-store.js";
import { namesClash } from "../ops/site/functions/_lib/item-key.js";

const SKIP_SKUS = new Set(["DGSU0034"]);

const LINES = [
  {
    sku: "MSD87018",
    name: "Gwenda Pilsner",
    kind: "beer",
    pack: "KEG11G",
    price: 83,
    slug: "pilsner-lager",
  },
  {
    sku: "CHD78006",
    name: "Caffrey's Black Stout",
    kind: "beer",
    pack: "KEG30L",
    price: 59.95,
    slug: "caffreys-black-stout",
  },
  {
    sku: "SPW47364",
    name: "Iron Wheel Kentucky Bourbon",
    kind: "liquor",
    pack: "BOTTLE",
    price: 16.2,
    slug: "iron-wheel-bourbon",
    abv: "40",
  },
  {
    sku: "SPG47098",
    name: "Roku Gin",
    kind: "liquor",
    pack: "BOTTLE",
    price: 25.48,
    slug: "roku-gin",
    abv: "43",
  },
  {
    sku: "SPG47363",
    name: "Arboretum Gin",
    kind: "liquor",
    pack: "BOTTLE",
    price: 13.74,
    slug: "arber-arboretum-gin",
  },
  {
    sku: "SPV47006",
    name: "42 Below Vodka",
    kind: "liquor",
    pack: "BOTTLE",
    price: 17.85,
    slug: "42-below-vodka",
  },
  {
    sku: "SPV47466",
    name: "Moonshine Vodka",
    kind: "liquor",
    pack: "BOTTLE",
    price: 13.8,
    slug: "moonshine-vodka",
  },
  {
    sku: "SPR47124",
    name: "Admiral's Old J Spiced Rum",
    kind: "liquor",
    pack: "BOTTLE",
    price: 19.99,
    slug: "admirals-old-j-spiced-rum",
    abv: "35",
  },
  {
    sku: "SPR47387",
    name: "Juan de la Costa White Rum",
    kind: "liquor",
    pack: "BOTTLE",
    price: 14.54,
    slug: "juan-de-la-costa-white-rum",
    abv: "37.5",
  },
  {
    sku: "SPA47010",
    name: "Campari",
    kind: "liqueur",
    pack: "BOTTLE",
    price: 15.1,
    slug: "campari-bitter",
  },
  {
    sku: "SPL47373",
    name: "Amaro Montenegro",
    kind: "liqueur",
    pack: "BOTTLE",
    price: 18.5,
    slug: "amaro-montenegro-liqueur",
  },
  {
    sku: "SPL47660",
    name: "Rooster Rojo Blanco Tequila",
    kind: "liquor",
    pack: "BOTTLE",
    price: 21.1,
    slug: "rooster-rojo-blanco-tequila",
    abv: "38",
  },
  {
    sku: "SPV47452",
    name: "AU Vodka",
    kind: "liquor",
    pack: "BOTTLE",
    price: 22.9,
    slug: "au-vodka",
    abv: "40",
  },
  {
    sku: "SPW47005",
    name: "Jameson Irish Whiskey",
    kind: "liquor",
    pack: "BOTTLE",
    price: 19.89,
    slug: "jameson-whiskey",
    abv: "40",
  },
  {
    sku: "SPG47382",
    name: "Arboretum Pink Gin",
    kind: "liquor",
    pack: "BOTTLE",
    price: 14.31,
    slug: "arber-arboretum-pink-gin",
    abv: "37.5",
  },
  {
    sku: "SPL47762",
    name: "Paixão Coffee",
    kind: "liqueur",
    pack: "BOTTLE",
    price: 11.05,
    slug: "paixao-coffee",
    abv: "17",
  },
  {
    sku: "SPV47467",
    name: "Moonshine Vanilla Vodka",
    kind: "liquor",
    pack: "BOTTLE",
    price: 14.5,
    slug: "moonshine-vanilla-vodka",
    abv: "37.5",
  },
  {
    sku: "SPR47388",
    name: "Juan de la Costa Dark Rum",
    kind: "liquor",
    pack: "BOTTLE",
    price: 15.51,
    slug: "juan-de-la-costa-dark-rum",
    abv: "37.5",
  },
  {
    sku: "SPR47395",
    name: "Juan de la Costa Spiced Rum",
    kind: "liquor",
    pack: "BOTTLE",
    price: 15.17,
    slug: "juan-de-la-costa-spiced-rum",
  },
];

function envFromProcess() {
  return {
    BASEROW_API_KEY: process.env.BASEROW_API_KEY,
    BASEROW_API_URL: process.env.BASEROW_API_URL,
    BASEROW_OPS_DATABASE_ID: process.env.BASEROW_OPS_DATABASE_ID,
  };
}

function hillsUrl(sku, slug) {
  return `https://www.hillsprospect.com/displayitemdetails/P/${sku}/${slug}`;
}

function findItem(items, line) {
  const sku = line.sku.toUpperCase();
  const bySku = items.find((item) =>
    (item.suppliers || []).some(
      (row) => String(row.sku || "").trim().toUpperCase() === sku,
    ),
  );
  if (bySku) return bySku;
  return items.find((item) => namesClash(item.name, line.name));
}

function supplierLink(line) {
  return {
    name: "Hills Prospect",
    productUrl: hillsUrl(line.sku, line.slug),
    sku: line.sku,
    pack: line.pack,
    price: line.price,
  };
}

function mergeSuppliers(item, link) {
  const sku = String(link.sku || "").toUpperCase();
  const existing = item?.suppliers || [];
  const rest = existing.filter(
    (row) => String(row.sku || "").trim().toUpperCase() !== sku,
  );
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
  const linked = [];
  const present = [];

  for (const line of LINES) {
    if (SKIP_SKUS.has(line.sku)) continue;
    const items = await listInventory(env, { includeInactive: true });
    const hit = findItem(items, line);
    const link = supplierLink(line);
    if (!hit) {
      const item = await createInventoryItem(env, {
        name: line.name,
        kind: line.kind,
        defaultUnit: "ml",
        abv: line.abv,
        estimatedCost: line.price,
        active: true,
        suppliers: [link],
      });
      created.push(`${item.name} ${line.sku}`);
      continue;
    }
    const already = (hit.suppliers || []).some(
      (row) =>
        String(row.sku || "").trim().toUpperCase() === line.sku &&
        Number(row.price) === line.price &&
        String(row.pack || "") === line.pack,
    );
    const needsActive = hit.active === false;
    if (already && !needsActive) {
      present.push(`${hit.name} ${line.sku}`);
      continue;
    }
    await updateInventoryItem(env, hit._id, {
      active: true,
      suppliers: mergeSuppliers(hit, link),
    });
    linked.push(`${hit.name} ${line.sku}`);
  }

  console.log(`Created ${created.length}:`);
  for (const row of created) console.log(`  + ${row}`);
  console.log(`Updated supplier link ${linked.length}:`);
  for (const row of linked) console.log(`  ~ ${row}`);
  console.log(`Already current ${present.length}:`);
  for (const row of present) console.log(`  ✓ ${row}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
