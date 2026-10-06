#!/usr/bin/env node
/**
 * Align the ops menu sections + Sanity with the guest print tree.
 * Deletes leftover untitled sample rows. Does not rewrite recipes. The ops
 * side goes through the menu repository (Baserow or D1, wherever the menu
 * lives).
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
import { menuRepository } from "../ops/site/src/menu/server/menu-repository.js";

const repo = menuRepository(process.env);

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

async function deleteUntitledRows() {
  console.log("Untitled leftovers…");
  for (const [collection, label] of [
    ["menu_sections", "section"],
    ["menu_items", "item"],
  ]) {
    for (const record of await repo.list(collection)) {
      if (String(record.name || "").trim()) continue;
      await repo.remove(collection, record.id);
      console.log(`  deleted untitled ${label} #${record.id}`);
    }
  }
}

async function ensureOpsSections() {
  console.log("Ops sections…");
  let order = 0;
  for (const chapter of PRINT_MENU_CHAPTERS) {
    order += 1;
    const chapterId = await upsertSection({
      title: chapter.title,
      slug: chapter.slug,
      subtitle: chapter.subtitle,
      order,
    });
    for (const sub of chapter.subsections || []) {
      order += 1;
      await upsertSection({
        title: sub.title,
        slug: sub.slug,
        order,
        parentId: chapterId,
      });
    }
  }
}

async function upsertSection({ title, slug, subtitle, order, parentId }) {
  const existing = (await repo.list("menu_sections")).find(
    (record) => String(record.slug || "").trim() === slug,
  );
  const fields = {
    name: title,
    slug,
    subtitle: subtitle || "",
    order,
    parentId: parentId || null,
  };
  if (existing) {
    await repo.update("menu_sections", existing.id, fields);
    console.log(`  ${title}`);
    return existing.id;
  }
  const created = await repo.create("menu_sections", fields);
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
  await deleteUntitledRows();
  await ensureOpsSections();

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
