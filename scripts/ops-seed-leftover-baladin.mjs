#!/usr/bin/env node
/**
 * Leftover Baladin still on the live POS, not on Fall print/digital.
 * Creates a Gwenda POS menu, leftover drinks (POS only), stamps Nazionale /
 * Botanic SKUs, and ensures Gwenda Pilsner stock exists (Lightspeed keg SKUs
 * were archived; Fall 2026 export allocates a new G-code).
 *
 *   node scripts/with-ops-env.mjs node scripts/ops-seed-leftover-baladin.mjs
 */
import { OPS_PRODUCTION_DATABASE_ID } from "../ops/site/functions/_lib/baserow.js";
import {
  createInventoryItem,
  listInventory,
} from "../ops/site/functions/_lib/inventory-store.js";
import { itemSlug, namesClash } from "../ops/site/functions/_lib/item-key.js";
import { flattenMenuSections } from "../ops/site/functions/_lib/menu-sections.js";
import {
  applyLightspeedMenuMatch,
  createMenuItem,
  loadMenuTree,
  updateMenuItem,
} from "../ops/site/functions/_lib/menu-store.js";
import {
  createPosMenu,
  listPosMenus,
  LIVE_POS_MENU_NAME,
} from "../ops/site/functions/_lib/pos-menu-store.js";

const LIVE_MENU_NAME = LIVE_POS_MENU_NAME;

const LEFTOVERS = [
  {
    name: "Baladin L'Ippa",
    sku: "869E0JTF9",
    lightspeedName: "Baladin L'Ippa (pint)",
    price: "7.5",
    priceAlt: "4",
    drinkType: "beer",
    section: /beer/i,
  },
  {
    name: "Baladin Sidro",
    sku: "869E0JT8U",
    lightspeedName: "Baladin Sidro (pint)",
    price: "6.5",
    priceAlt: "4",
    drinkType: "beer",
    section: /beer/i,
  },
  {
    name: "Baladin 4.8",
    sku: "147",
    lightspeedName: "Baladin 4.8 (pint)",
    price: "6.95",
    priceAlt: "4",
    drinkType: "beer",
    section: /beer/i,
  },
  {
    name: "Baladin Cedrata",
    sku: "869E0JT7F",
    lightspeedName: "Baladin Cedrata 330ml",
    price: "5",
    drinkType: "packaged",
    section: /soft/i,
  },
];

const SKU_STAMPS = [
  { match: /botanic/i, sku: "149", lightspeedName: "Baladin Botanic Blonde Analcolica 33cl" },
  { match: /nazionale/i, sku: "169", lightspeedName: "Baladin Nazionale Gluten Free 33cl" },
];

function envFromProcess() {
  return {
    BASEROW_API_KEY: process.env.BASEROW_API_KEY,
    BASEROW_API_URL: process.env.BASEROW_API_URL,
    BASEROW_OPS_DATABASE_ID: process.env.BASEROW_OPS_DATABASE_ID,
  };
}

function findByName(items, name) {
  return (items || []).find(
    (item) => namesClash(item.name, name) || itemSlug(item.name) === itemSlug(name),
  );
}

function findSectionId(sections, items, pattern) {
  const flat = flattenMenuSections(sections || []);
  const hit = flat.find(
    (section) =>
      pattern.test(section.title || "") || pattern.test(section.slug || ""),
  );
  if (hit?._id) return hit._id;
  const beer = (items || []).find((item) => item.drinkType === "beer" && item.sectionId);
  return beer?.sectionId || flat[0]?._id || "";
}

async function main() {
  const env = envFromProcess();
  const dbId = String(env.BASEROW_OPS_DATABASE_ID || "").trim();
  if (!env.BASEROW_API_KEY) {
    throw new Error("BASEROW_API_KEY is missing.");
  }
  if (!dbId) {
    throw new Error("BASEROW_OPS_DATABASE_ID is missing.");
  }
  if (dbId === OPS_PRODUCTION_DATABASE_ID) {
    throw new Error(
      `Refusing to write leftover Baladin to production Ops (${OPS_PRODUCTION_DATABASE_ID}).`,
    );
  }
  console.log(`Using BASEROW_OPS_DATABASE_ID=${dbId}`);

  let posMenus = await listPosMenus(env);
  let live = posMenus.find((menu) => namesClash(menu.name, LIVE_MENU_NAME));
  if (!live) {
    live = await createPosMenu(env, { name: LIVE_MENU_NAME, isDefault: false });
    console.log(`Created POS menu ${live.name} (${live.id})`);
  } else {
    console.log(`Using POS menu ${live.name} (${live.id})`);
  }

  const tree = await loadMenuTree(env);
  const patches = [];

  for (const spec of LEFTOVERS) {
    const sectionId = findSectionId(tree.sections, tree.items, spec.section);
    if (!sectionId) {
      throw new Error(`No menu section matching ${spec.section} for ${spec.name}.`);
    }
    const existing = findByName(tree.items, spec.name);
    const payload = {
      name: spec.name,
      sectionId,
      drinkType: spec.drinkType,
      price: spec.price,
      priceAlt: spec.priceAlt,
      lightspeedSku: spec.sku,
      lightspeedName: spec.lightspeedName,
      lightspeedStatus: "matched",
      onPrintMenu: false,
      onDigitalMenu: false,
      posMenuIds: [live.id],
      ingredients: existing?.ingredients || [],
    };
    if (existing) {
      await updateMenuItem(env, existing._id, {
        ...existing,
        ...payload,
        sectionId: existing.sectionId || sectionId,
      });
      console.log(`Updated leftover ${spec.name} (${existing._id})`);
    } else {
      const created = await createMenuItem(env, payload);
      tree.items.push(created);
      console.log(`Created leftover ${spec.name} (${created._id})`);
    }
  }

  for (const stamp of SKU_STAMPS) {
    const item = (tree.items || []).find((row) => stamp.match.test(row.name || ""));
    if (!item) {
      console.log(`No ops drink matching ${stamp.match} to stamp SKU ${stamp.sku}`);
      continue;
    }
    patches.push({
      id: item._id,
      lightspeedSku: stamp.sku,
      lightspeedName: stamp.lightspeedName,
      lightspeedStatus: "matched",
    });
  }
  if (patches.length) {
    await applyLightspeedMenuMatch(env, patches);
    for (const patch of patches) {
      console.log(`Stamped SKU ${patch.lightspeedSku} onto ${patch.id}`);
    }
  }

  const inventory = await listInventory(env).catch(() => []);
  let pilsner = inventory.find((row) => namesClash(row.name, "Gwenda Pilsner"));
  const legacyKeg = inventory.find(
    (row) =>
      namesClash(row.name, "Gwenda Beer Keg") || /beer keg/i.test(row.name || ""),
  );
  if (!pilsner) {
    pilsner = await createInventoryItem(env, {
      name: "Gwenda Pilsner",
      kind: "beer",
      defaultUnit: "ml",
    });
    console.log(`Created inventory ${pilsner.name} (${pilsner._id || pilsner.id})`);
  } else {
    console.log(`Inventory already has ${pilsner.name} (${pilsner._id || pilsner.id})`);
  }
  if (legacyKeg && String(legacyKeg._id || legacyKeg.id) !== String(pilsner._id || pilsner.id)) {
    console.log(
      `Note: legacy "${legacyKeg.name}" (${legacyKeg._id || legacyKeg.id}) still exists; prefer Gwenda Pilsner.`,
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
