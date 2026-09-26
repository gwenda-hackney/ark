#!/usr/bin/env node
/**
 * Align Baserow + Sanity menu sections with the guest print tree.
 * Deletes leftover untitled Baserow sample rows. Does not rewrite recipes.
 * Writes published Sanity documents, not drafts: point it at Gwenda Dev
 * (SANITY_PROJECT_ID=gwscpagy) unless the change should go live.
 *
 *   node scripts/with-ops-env.mjs node scripts/sync-print-menu-sections.mjs
 */
import { createClient } from "@sanity/client";
import { LexoRank } from "lexorank";
import {
  PRINT_MENU_CHAPTERS,
  flattenPrintMenuSections,
} from "./lib/print-menu-sections.mjs";
import { requireOpsTables } from "./lib/ops-baserow-tables.mjs";

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.BASEROW_API_KEY?.trim();
let sectionsTableId = "";
let itemsTableId = "";

if (!apiKey) {
  console.error("Need BASEROW_API_KEY");
  process.exit(1);
}

const PRINT_ITEMS = [
  {
    sectionSlug: "bottled-beer",
    name: "Menabrea Bionda Lager",
    price: "4",
    drinkType: "packaged",
    abv: "4.8%",
    volume: "33cl",
    producer: "Menabrea",
  },
  {
    sectionSlug: "bottled-beer",
    name: "Baladin Nazionale Blonde Ale",
    price: "6",
    drinkType: "packaged",
    abv: "6.5%",
    volume: "33cl",
    producer: "Baladin",
    notes: "Gluten free",
  },
  {
    sectionSlug: "bottled-beer",
    name: "Baladin Botanic Blonde NA",
    price: "5.5",
    drinkType: "packaged",
    abv: "0.0%",
    volume: "33cl",
    producer: "Baladin",
  },
  {
    sectionSlug: "draught-beer",
    name: "Gwenda Pilsner",
    price: "6.5",
    drinkType: "beer",
  },
  {
    sectionSlug: "draught-beer",
    name: "Tiny Rebel IPA",
    price: "7",
    drinkType: "beer",
  },
  {
    sectionSlug: "draught-beer",
    name: "Caffrey's Black Stout",
    price: "7.5",
    drinkType: "beer",
  },
  {
    sectionSlug: "agave",
    name: "Bandero Premium Blanco",
    price: "7",
    drinkType: "pour",
  },
  {
    sectionSlug: "agave",
    name: "Cazadores Reposado Tequila",
    price: "6",
    drinkType: "pour",
  },
  {
    sectionSlug: "agave",
    name: "Astral Tequila Blanco",
    price: "5",
    drinkType: "pour",
  },
  {
    sectionSlug: "agave",
    name: "Ilegal Joven Mezcal",
    price: "7",
    drinkType: "pour",
  },
  {
    sectionSlug: "agave",
    name: "Ojo de Dios Mezcal Joven",
    price: "6",
    drinkType: "pour",
  },
  {
    sectionSlug: "rum",
    name: "El Dorado 12 Year Old Rum",
    price: "8",
    drinkType: "pour",
  },
  {
    sectionSlug: "rum",
    name: "Admiral's Old J Tiki Fire Spiced Rum",
    price: "5",
    drinkType: "pour",
  },
  {
    sectionSlug: "rum",
    name: "Bacardi Reserva Ocho Rum",
    price: "6",
    drinkType: "pour",
  },
  {
    sectionSlug: "whiskey",
    name: "Slane Irish Whiskey",
    price: "6",
    drinkType: "pour",
  },
  {
    sectionSlug: "whiskey",
    name: "Maker's Mark 46",
    price: "7",
    drinkType: "pour",
  },
  {
    sectionSlug: "whiskey",
    name: "Laphroaig 10 Year Old Whisky",
    price: "8",
    drinkType: "pour",
  },
  {
    sectionSlug: "amaro-digestivi",
    name: "Vecchio Amaro del Capo",
    price: "5",
    drinkType: "pour",
    aliases: ["Vecchio Amaro Del Capo"],
  },
  {
    sectionSlug: "amaro-digestivi",
    name: "Amaro Montenegro",
    price: "6",
    drinkType: "pour",
  },
  {
    sectionSlug: "amaro-digestivi",
    name: "Grappa Nardini Bianca",
    price: "5",
    drinkType: "pour",
  },
  {
    sectionSlug: "amaro-digestivi",
    name: "Grappa Diciotto Lune",
    price: "6",
    drinkType: "pour",
  },
  {
    sectionSlug: "amaro-digestivi",
    name: "Pernod Absinthe Supérieure",
    price: "7",
    drinkType: "pour",
  },
];

const DROP_SANITY_NAMES = new Set([
  "Grappa",
  "Grappa Barricata 1903 Mezzaluna",
  "Amaro Lucano",
  "Sambuca Molinari",
  "Mirto Rosso",
  "Jameson",
  "Jameson Black Barrel",
  "Vecchio Amaro Del Capo",
  "Sombrero Crema de Plátano y Tequila",
  "Sombrero Crema de Maracuyá",
  "Moscow Mule",
  "Gin and Tonic",
  "Rum and Coke",
  "Vodka Energy",
  "Vodka Lemon",
]);

async function baserow(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} → ${response.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

async function listRows(tableId) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await baserow(
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(payload.results || []));
    if (!payload.next) break;
    page += 1;
  }
  return rows;
}

function allocateOrderRanks(count) {
  const ranks = [];
  let rank = LexoRank.min();
  for (let i = 0; i < count; i += 1) {
    rank = rank.genNext().genNext();
    ranks.push(rank.toString());
  }
  return ranks;
}

function sanityClient() {
  const token = process.env.SANITY_API_TOKEN?.trim();
  const projectId = process.env.SANITY_PROJECT_ID?.trim() || "pn5yjro6";
  const dataset = process.env.SANITY_DATASET?.trim() || "production";
  if (!token) return null;
  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
  });
}

async function deleteGhostBaserowRows() {
  console.log("Baserow leftovers…");
  for (const [tableId, label] of [
    [sectionsTableId, "section"],
    [itemsTableId, "item"],
  ]) {
    const rows = await listRows(tableId);
    for (const row of rows) {
      if (String(row.Name || "").trim()) continue;
      await baserow(`/api/database/rows/table/${tableId}/${row.id}/`, {
        method: "DELETE",
      });
      console.log(`  deleted untitled ${label} #${row.id}`);
    }
  }
}

async function ensureBaserowSections() {
  console.log("Baserow sections…");
  let order = 0;
  for (const chapter of PRINT_MENU_CHAPTERS) {
    order += 1;
    const chapterId = await upsertBaserowSection({
      title: chapter.title,
      slug: chapter.slug,
      subtitle: chapter.subtitle,
      order,
    });
    for (const sub of chapter.subsections || []) {
      order += 1;
      await upsertBaserowSection({
        title: sub.title,
        slug: sub.slug,
        order,
        parentId: chapterId,
      });
    }
  }
}

async function upsertBaserowSection({ title, slug, subtitle, order, parentId }) {
  const existing = (await listRows(sectionsTableId)).find(
    (row) => String(row.Slug || "").trim() === slug,
  );
  const fields = {
    Name: title,
    Slug: slug,
    Subtitle: subtitle || "",
    Order: order,
    Parent: parentId ? [parentId] : [],
  };
  if (existing) {
    await baserow(
      `/api/database/rows/table/${sectionsTableId}/${existing.id}/?user_field_names=true`,
      { method: "PATCH", body: JSON.stringify(fields) },
    );
    console.log(`  ${title}`);
    return existing.id;
  }
  const created = await baserow(
    `/api/database/rows/table/${sectionsTableId}/?user_field_names=true`,
    { method: "POST", body: JSON.stringify(fields) },
  );
  console.log(`  created ${title}`);
  return created.id;
}

async function ensureSanityTree(client) {
  console.log(`Sanity sections (${client.config().dataset})…`);
  const flat = flattenPrintMenuSections();
  const ranks = allocateOrderRanks(flat.length);
  const ids = {};
  for (const [index, section] of flat.entries()) {
    const parentId = section.parentSlug ? ids[section.parentSlug] : undefined;
    const existingId = await client.fetch(
      `*[_type == "menuSection" && slug.current == $slug][0]._id`,
      { slug: section.slug },
    );
    const fields = {
      title: section.title,
      orderRank: ranks[index],
      slug: { _type: "slug", current: section.slug },
      ...(section.subtitle ? { subtitle: section.subtitle } : {}),
      ...(parentId ? { parent: { _type: "reference", _ref: parentId } } : {}),
    };
    const unsetFields = [];
    if (!section.subtitle) unsetFields.push("subtitle");
    if (!parentId) unsetFields.push("parent");
    if (existingId) {
      await client.patch(existingId).set(fields).unset(unsetFields).commit();
      ids[section.slug] = existingId;
    } else {
      const created = await client.create({
        _type: "menuSection",
        ...fields,
      });
      ids[section.slug] = created._id;
      console.log(`  created ${section.title}`);
    }
    console.log(`  ${section.parentSlug ? "↳ " : ""}${section.title}`);
  }
  return ids;
}

async function ensureSanityPrintItems(client, sectionIds) {
  console.log("Sanity print items…");
  const existing = await client.fetch(
    `*[_type == "menuItem" && !(_id in path("drafts.**"))]{ _id, name, "section": section->slug.current }`,
  );
  const byName = new Map(
    existing.map((doc) => [String(doc.name || "").trim().toLowerCase(), doc]),
  );

  for (const item of PRINT_ITEMS) {
    const sectionId = sectionIds[item.sectionSlug];
    if (!sectionId) throw new Error(`Missing Sanity section ${item.sectionSlug}`);
    const names = [item.name, ...(item.aliases || [])];
    const hit = names
      .map((name) => byName.get(name.toLowerCase()))
      .find(Boolean);
    const fields = {
      name: item.name,
      drinkType: item.drinkType,
      section: { _type: "reference", _ref: sectionId },
      price: item.price,
      ...(item.priceAlt ? { priceAlt: item.priceAlt } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.abv ? { abv: item.abv } : {}),
      ...(item.volume ? { volume: item.volume } : {}),
      ...(item.producer ? { producer: item.producer } : {}),
    };
    if (hit) {
      const unsetFields = [];
      if (!item.priceAlt) unsetFields.push("priceAlt");
      if (!item.notes) unsetFields.push("notes");
      if (!item.abv) unsetFields.push("abv");
      if (!item.volume) unsetFields.push("volume");
      if (!item.producer) unsetFields.push("producer");
      await client.patch(hit._id).set(fields).unset(unsetFields).commit();
      byName.set(item.name.toLowerCase(), { ...hit, name: item.name });
      console.log(`  ${item.name}`);
    } else {
      const created = await client.create({ _type: "menuItem", ...fields });
      byName.set(item.name.toLowerCase(), created);
      console.log(`  created ${item.name}`);
    }
  }

  for (const doc of existing) {
    if (!DROP_SANITY_NAMES.has(doc.name)) continue;
    await client.delete(doc._id);
    console.log(`  removed ${doc.name}`);
  }

  await patchGuestFacingPrint(client);
  await dropEmptyLeftoverSections(client);
}

const GUEST_PATCHES = [
  {
    name: "The Wick",
    set: {
      description: "Finlandia vodka, coconut water, blue curaçao, lime, soda",
    },
  },
  {
    name: "Spicy Margarita",
    set: { price: "10" },
  },
  {
    name: "Tiny Rebel IPA",
    unset: ["notes"],
  },
];

async function patchGuestFacingPrint(client) {
  console.log("Guest-facing print patches…");
  for (const patch of GUEST_PATCHES) {
    const id = await client.fetch(
      `*[_type == "menuItem" && name == $name && !(_id in path("drafts.**"))][0]._id`,
      { name: patch.name },
    );
    if (!id) {
      console.log(`  skip ${patch.name} (missing)`);
      continue;
    }
    let next = client.patch(id);
    if (patch.set) next = next.set(patch.set);
    if (patch.unset) next = next.unset(patch.unset);
    await next.commit();
    console.log(`  ${patch.name}`);
  }

  const pours = await client.fetch(
    `*[_type == "menuItem" && drinkType == "pour" && !(_id in path("drafts.**"))]{ _id, name, description }`,
  );
  for (const doc of pours) {
    const description = String(doc.description || "").trim();
    if (!description || description === doc.name) {
      if (!description) continue;
      await client.patch(doc._id).unset(["description"]).commit();
      console.log(`  cleared pour description ${doc.name}`);
    }
  }
}

const LEFTOVER_SECTION_SLUGS = ["amaro", "grappa", "liqueurs"];

async function dropEmptyLeftoverSections(client) {
  console.log("Leftover Sanity sections…");
  for (const slug of LEFTOVER_SECTION_SLUGS) {
    const section = await client.fetch(
      `*[_type == "menuSection" && slug.current == $slug][0]{ _id, title, "itemCount": count(*[_type == "menuItem" && references(^._id)]) }`,
      { slug },
    );
    if (!section?._id) continue;
    if (section.itemCount > 0) {
      console.log(`  keep ${section.title} (${section.itemCount} items)`);
      continue;
    }
    await client.delete(section._id);
    console.log(`  removed empty section ${section.title}`);
  }
}

async function main() {
  const tables = await requireOpsTables();
  sectionsTableId = tables.sections;
  itemsTableId = tables.items;
  await deleteGhostBaserowRows();
  await ensureBaserowSections();

  const client = sanityClient();
  if (!client) {
    console.log("Skip Sanity (no SANITY_API_TOKEN).");
    return;
  }
  const sectionIds = await ensureSanityTree(client);
  await ensureSanityPrintItems(client, sectionIds);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
