#!/usr/bin/env node
/**
 * Soft Drinks as menu items (POS only): postmix pours with pint / half prices.
 *
 * Inventory keeps the BIB stock for recipe cost. Menu items are the till buttons.
 *
 *   node scripts/with-ops-env.mjs node scripts/ops-seed-soft-drinks.mjs
 */
import { OPS_PRODUCTION_DATABASE_ID } from "../ops/site/functions/_lib/baserow.js";
import {
  createMenuItem,
  createMenuSection,
  loadMenuTree,
  updateMenuItem,
  updateMenuSection,
} from "../ops/site/functions/_lib/menu-store.js";
import { namesClash } from "../ops/site/functions/_lib/item-key.js";
import { flattenMenuSections } from "../ops/site/functions/_lib/menu-sections.js";
import { listPosMenus } from "../ops/site/functions/_lib/pos-menu-store.js";

const DRINKS = [
  {
    name: "Coca-Cola",
    price: "3.5",
    priceAlt: "2",
    lightspeedSku: "157",
    lightspeedSkuAlt: "163",
    lightspeedName: "Coke",
  },
  {
    name: "Diet Coke",
    price: "3.5",
    priceAlt: "2",
    lightspeedSku: "164",
    lightspeedSkuAlt: "165",
    lightspeedName: "Diet Coke",
  },
  {
    name: "Sunkist Lemonade",
    price: "3.5",
    priceAlt: "2",
    lightspeedSku: "159",
    lightspeedSkuAlt: "151",
    lightspeedName: "Lemonade",
  },
  {
    name: "Tonic water",
    price: "3.5",
    priceAlt: "2",
    lightspeedSku: "869E0JU71",
    lightspeedSkuAlt: "160",
    lightspeedName: "Tonic",
  },
  {
    name: "Ginger beer",
    price: "4",
    priceAlt: "2",
    lightspeedSku: "869E0JTD0",
    lightspeedSkuAlt: "161",
    lightspeedName: "Ginger",
  },
  {
    name: "Orange juice",
    price: "3.5",
    priceAlt: "2",
    lightspeedSku: "170",
    lightspeedSkuAlt: "162",
    lightspeedName: "Orange Juice",
  },
];

function envFromProcess() {
  return { ...process.env };
}

async function main() {
  const env = envFromProcess();
  const dbId = String(env.BASEROW_OPS_DATABASE_ID || "").trim();
  if (!env.BASEROW_API_KEY) throw new Error("Need BASEROW_API_KEY.");
  if (!dbId) throw new Error("BASEROW_OPS_DATABASE_ID is missing.");
  if (dbId === OPS_PRODUCTION_DATABASE_ID) {
    throw new Error("Refusing to write production Ops. Point at the clone.");
  }

  let { sections, items } = await loadMenuTree(env);
  const flat = flattenMenuSections(sections);
  let soft = flat.find(
    (s) => String(s.title || "").trim().toLowerCase() === "soft drinks",
  );
  if (!soft) {
    soft = await createMenuSection(env, {
      title: "Soft Drinks",
      parentId: null,
      orderRank: 20,
    });
    console.log("created section Soft Drinks", soft._id);
    ({ sections, items } = await loadMenuTree(env));
  } else if (soft.parentId) {
    soft = await updateMenuSection(env, soft._id, {
      title: soft.title,
      parentId: null,
    });
    console.log("moved Soft Drinks to top-level");
  }

  const posMenus = await listPosMenus(env);
  const fall = (posMenus || []).find(
    (m) => String(m.name || "").trim().toLowerCase() === "fall 2026",
  );
  const gwenda = (posMenus || []).find((m) =>
    /^gwenda$/i.test(String(m.name || "").trim()),
  );
  const posMenuIds = [fall?.id, gwenda?.id].filter(Boolean);

  for (const def of DRINKS) {
    const hit = (items || []).find((item) => namesClash(item.name, def.name));
    const payload = {
      name: def.name,
      sectionId: soft._id,
      price: def.price,
      priceAlt: def.priceAlt,
      drinkType: "postmix",
      onPrintMenu: false,
      onDigitalMenu: false,
      lightspeedSku: def.lightspeedSku,
      lightspeedSkuAlt: def.lightspeedSkuAlt,
      lightspeedName: def.lightspeedName,
      lightspeedMenuScreen: "Soft Drinks",
      posMenuIds,
      ingredients: [],
    };
    if (hit) {
      await updateMenuItem(env, hit._id || hit.id, payload);
      console.log("updated", def.name);
    } else {
      await createMenuItem(env, payload);
      console.log("created", def.name);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
