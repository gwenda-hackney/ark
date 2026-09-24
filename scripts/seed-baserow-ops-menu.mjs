#!/usr/bin/env node
/**
 * Seed Menu Sections (and empty item placeholders optional) into Baserow Ops
 * from the same chapter structure as marketing/studio/scripts/seed-menu.mjs.
 *
 * Usage:
 *   node scripts/with-ops-env.mjs node scripts/seed-baserow-ops-menu.mjs
 */
import { createClient } from "@sanity/client";
import { PRINT_MENU_CHAPTERS } from "./lib/print-menu-sections.mjs";
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
  const dataset = process.env.SANITY_DATASET?.trim() || "staging";
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
  const dataset = process.env.SANITY_DATASET?.trim() || "staging";
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
  const tables = await requireOpsTables();
  sectionsTableId = tables.sections;
  itemsTableId = tables.items;
  console.log("Seeding Baserow Ops menu sections…");
  const sanitySections = await sanitySectionMap();
  const sectionIdBySlug = new Map();
  let order = 0;
  for (const chapter of PRINT_MENU_CHAPTERS) {
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

  console.log("Syncing menu items from Sanity staging…");
  await syncItemsFromSanity(sectionIdBySlug);
  console.log("Done.");
  console.log(`Grid: https://baserow.io/database/${process.env.BASEROW_OPS_DATABASE_ID}/`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
