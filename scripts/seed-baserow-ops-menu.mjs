#!/usr/bin/env node
/**
 * Seed Menu Sections (and empty item placeholders optional) into Baserow Ops
 * from the same chapter structure as marketing/studio/scripts/seed-menu.mjs.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-baserow-ops-menu.mjs
 */
import { createClient } from "@sanity/client";

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.BASEROW_API_KEY?.trim();
const sectionsTableId = process.env.BASEROW_OPS_SECTIONS_TABLE_ID?.trim();
const itemsTableId = process.env.BASEROW_OPS_ITEMS_TABLE_ID?.trim();

if (!apiKey || !sectionsTableId || !itemsTableId) {
  console.error(
    "Need BASEROW_API_KEY, BASEROW_OPS_SECTIONS_TABLE_ID, BASEROW_OPS_ITEMS_TABLE_ID",
  );
  process.exit(1);
}

const MENU_CHAPTERS = [
  {
    title: "Our Formulas",
    slug: "our-formulas",
    subtitle:
      "The definitive liquid experience. Elegant expressions crafted for candlelit evenings.",
  },
  {
    title: "Free of Spirit",
    slug: "free-of-spirit",
    subtitle:
      "The mindful liquid experience. Zero-proof expressions crafted with the same complexity.",
  },
  {
    title: "By the Book",
    slug: "by-the-book",
    subtitle: "The traditional liquid ritual. Timeless serves, made as you know them.",
    subsections: [
      { title: "Spritz", slug: "spritz" },
      { title: "Negroni", slug: "negroni" },
      { title: "Sour", slug: "sour" },
      { title: "Highball", slug: "highball" },
      { title: "Bottled Beer", slug: "bottled-beer" },
    ],
  },
  {
    title: "The Cabinet",
    slug: "the-cabinet",
    subtitle: "The liquid cabinet. Amaro, grappa, and whiskey for the quieter close.",
    subsections: [
      { title: "Amaro", slug: "amaro" },
      { title: "Whiskey", slug: "whiskey" },
      { title: "Grappa", slug: "grappa" },
      { title: "Liqueurs", slug: "liqueurs" },
    ],
  },
];

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
    throw new Error(`${path} → ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
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

async function ensureSection({ title, slug, subtitle, order, parentId, sanityId }) {
  const existing = (await listRows(sectionsTableId)).find(
    (row) => String(row.Slug || "").trim() === slug,
  );
  const fields = {
    Name: title,
    Slug: slug,
    Subtitle: subtitle || "",
    Order: order,
    ...(parentId ? { Parent: [parentId] } : { Parent: [] }),
    ...(sanityId ? { "Sanity ID": sanityId } : {}),
  };
  if (existing) {
    await baserow(`/api/database/rows/table/${sectionsTableId}/${existing.id}/?user_field_names=true`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    console.log(`  updated section ${title}`);
    return existing.id;
  }
  const created = await baserow(
    `/api/database/rows/table/${sectionsTableId}/?user_field_names=true`,
    { method: "POST", body: JSON.stringify(fields) },
  );
  console.log(`  created section ${title}`);
  return created.id;
}

async function sanitySectionMap() {
  const token = process.env.SANITY_API_TOKEN?.trim();
  const projectId = process.env.SANITY_PROJECT_ID?.trim() || "pn5yjro6";
  const dataset = process.env.SANITY_DATASET?.trim() || "development";
  if (!token) return new Map();
  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
  });
  const docs = await client.fetch(
    `*[_type == "menuSection" && !(_id in path("drafts.**"))]{ _id, "slug": slug.current }`,
  );
  return new Map(
    (docs || [])
      .filter((doc) => doc.slug)
      .map((doc) => [doc.slug, doc._id]),
  );
}

async function syncItemsFromSanity(sectionIdBySlug) {
  const token = process.env.SANITY_API_TOKEN?.trim();
  if (!token) {
    console.log("Skip item sync (no SANITY_API_TOKEN).");
    return;
  }
  const projectId = process.env.SANITY_PROJECT_ID?.trim() || "pn5yjro6";
  const dataset = process.env.SANITY_DATASET?.trim() || "development";
  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
  });
  const items = await client.fetch(`*[_type == "menuItem" && !(_id in path("drafts.**"))]{
    _id,
    name,
    description,
    price,
    notes,
    signature,
    abv,
    volume,
    producer,
    "sectionSlug": section->slug.current
  }`);
  const existing = await listRows(itemsTableId);
  const byName = new Map(
    existing.map((row) => [String(row.Name || "").trim().toLowerCase(), row]),
  );

  let order = 0;
  for (const item of items || []) {
    order += 1;
    const sectionId = sectionIdBySlug.get(item.sectionSlug);
    if (!sectionId) {
      console.log(`  skip ${item.name} (section ${item.sectionSlug} missing)`);
      continue;
    }
    const fields = {
      Name: item.name,
      Section: [sectionId],
      "Menu line": item.description || "",
      Price: item.price || "",
      Type: item.notes || "",
      Signature: item.signature === true,
      ABV: item.abv || "",
      Volume: item.volume || "",
      Producer: item.producer || "",
      Order: order,
      "Sanity ID": item._id,
      "On digital menu": true,
      "Lock menu line": Boolean(item.description),
    };
    const hit = byName.get(String(item.name).trim().toLowerCase());
    if (hit) {
      await baserow(
        `/api/database/rows/table/${itemsTableId}/${hit.id}/?user_field_names=true`,
        { method: "PATCH", body: JSON.stringify(fields) },
      );
      console.log(`  updated item ${item.name}`);
    } else {
      await baserow(`/api/database/rows/table/${itemsTableId}/?user_field_names=true`, {
        method: "POST",
        body: JSON.stringify(fields),
      });
      console.log(`  created item ${item.name}`);
    }
  }
}

async function main() {
  console.log("Seeding Baserow Ops menu sections…");
  const sanitySections = await sanitySectionMap();
  const sectionIdBySlug = new Map();
  let order = 0;
  for (const chapter of MENU_CHAPTERS) {
    order += 1;
    const chapterId = await ensureSection({
      title: chapter.title,
      slug: chapter.slug,
      subtitle: chapter.subtitle,
      order,
      sanityId: sanitySections.get(chapter.slug),
    });
    sectionIdBySlug.set(chapter.slug, chapterId);
    for (const sub of chapter.subsections || []) {
      order += 1;
      const subId = await ensureSection({
        title: sub.title,
        slug: sub.slug,
        order,
        parentId: chapterId,
        sanityId: sanitySections.get(sub.slug),
      });
      sectionIdBySlug.set(sub.slug, subId);
    }
  }

  console.log("Syncing menu items from Sanity development…");
  await syncItemsFromSanity(sectionIdBySlug);
  console.log("Done.");
  console.log(`Grid: https://baserow.io/database/${process.env.BASEROW_OPS_DATABASE_ID}/`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
