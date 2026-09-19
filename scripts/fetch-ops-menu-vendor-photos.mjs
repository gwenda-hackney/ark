#!/usr/bin/env node
/**
 * Pull product photos from Hills Prospect (and similar vendor pages) onto
 * non-custom menu drinks: pours, packaged bottles, and draught beer.
 * Skips cocktails (Our Formulas / By the Book mixed drinks).
 *
 * Usage:
 *   node --env-file=.env scripts/fetch-ops-menu-vendor-photos.mjs
 *   node --env-file=.env scripts/fetch-ops-menu-vendor-photos.mjs --dry-run
 *   node --env-file=.env scripts/fetch-ops-menu-vendor-photos.mjs --force
 */
import { requireOpsTables } from "./lib/ops-baserow-tables.mjs";

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.BASEROW_API_KEY?.trim();
let itemsTableId = "";
let ingredientsTableId = "";
let inventorySuppliersTableId = "";
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

if (!apiKey) {
  console.error("Need BASEROW_API_KEY");
  process.exit(1);
}

const TARGET_TYPES = new Set(["pour", "packaged", "beer"]);
const UA =
  "Mozilla/5.0 (compatible; GwendaOps/1.0; +https://gwenda.co.uk)";

async function baserow(path, init = {}) {
  const headers = {
    Authorization: `Token ${apiKey}`,
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(
      `${path} → ${response.status}: ${JSON.stringify(json || text).slice(0, 400)}`,
    );
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

function selectValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }
  return "";
}

function linkId(field) {
  if (Array.isArray(field) && field[0] != null) {
    return typeof field[0] === "object" ? field[0].id : field[0];
  }
  return null;
}

function drinkType(row) {
  const raw = selectValue(row["Drink type"]).toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged") return raw;
  return "cocktail";
}

function hasPhoto(row) {
  return Array.isArray(row.Photo) && row.Photo.length > 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function absoluteUrl(href, pageUrl) {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return "";
  }
}

/** Prefer a larger Hills Prospect ImageHandler size when we can. */
function enlargeImageUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    if (!/\/ImageHandler\//i.test(url.pathname)) return imageUrl;
    url.searchParams.set("width", "1000");
    url.searchParams.set("height", "1500");
    url.pathname = url.pathname.replace(
      /\/(\d+)w\d+h\d+\//i,
      "/$1w1000h1500/",
    );
    return url.toString();
  } catch {
    return imageUrl;
  }
}

function extractProductImage(html, pageUrl) {
  const patterns = [
    /"image"\s*:\s*"(\/ImageHandler\/[^"]+)"/i,
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (!match?.[1]) continue;
    const abs = absoluteUrl(match[1].replace(/&amp;/g, "&"), pageUrl);
    if (abs) return enlargeImageUrl(abs);
  }
  return null;
}

async function fetchVendorImage(productUrl) {
  const page = await fetch(productUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!page.ok) {
    return { ok: false, reason: `page ${page.status}` };
  }
  const html = await page.text();
  const imageUrl = extractProductImage(html, productUrl);
  if (!imageUrl) {
    return { ok: false, reason: "no image on page" };
  }
  const image = await fetch(imageUrl, {
    headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!image.ok) {
    return { ok: false, reason: `image ${image.status}`, imageUrl };
  }
  const contentType = (image.headers.get("content-type") || "image/jpeg")
    .split(";")[0]
    .trim();
  if (!contentType.startsWith("image/")) {
    return { ok: false, reason: `not an image (${contentType})`, imageUrl };
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.byteLength < 1000) {
    return { ok: false, reason: "image too small", imageUrl };
  }
  const ext =
    contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  return { ok: true, bytes, contentType, imageUrl, ext };
}

async function uploadAndAttach(itemId, name, bytes, contentType, ext) {
  const form = new FormData();
  const slug = String(name || "drink")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  form.append(
    "file",
    new Blob([bytes], { type: contentType }),
    `${slug || "drink"}.${ext}`,
  );
  const uploaded = await baserow("/api/user-files/upload-file/", {
    method: "POST",
    body: form,
  });
  await baserow(
    `/api/database/rows/table/${itemsTableId}/${itemId}/?user_field_names=true`,
    {
      method: "PATCH",
      body: JSON.stringify({ Photo: [{ name: uploaded.name }] }),
    },
  );
  return uploaded.url || uploaded.name;
}

async function main() {
  const tables = await requireOpsTables();
  itemsTableId = tables.items;
  ingredientsTableId = tables.ingredients;
  inventorySuppliersTableId = tables.inventorySuppliers;
  if (!inventorySuppliersTableId) {
    throw new Error(
      'Baserow table "Inventory suppliers" not found. Run npm run setup:baserow-ops.',
    );
  }
  console.log(
    dryRun
      ? "Dry run: vendor photos for pour / packaged / beer…\n"
      : "Fetching vendor photos for pour / packaged / beer…\n",
  );

  const [items, ingredients, links] = await Promise.all([
    listRows(itemsTableId),
    listRows(ingredientsTableId),
    listRows(inventorySuppliersTableId),
  ]);

  const urlByInv = new Map();
  for (const link of links) {
    const invId = String(linkId(link.Inventory) ?? "");
    const url = String(link["Product URL"] || "").trim();
    if (!invId || !url) continue;
    if (!urlByInv.has(invId)) urlByInv.set(invId, url);
  }

  const firstInvByItem = new Map();
  for (const row of ingredients) {
    const itemId = Number(linkId(row["Menu Item"]));
    const invId = linkId(row.Inventory);
    if (!itemId || invId == null) continue;
    if (!firstInvByItem.has(itemId)) firstInvByItem.set(itemId, String(invId));
  }

  const targets = items.filter((row) => TARGET_TYPES.has(drinkType(row)));
  let uploaded = 0;
  let skipped = 0;
  const results = [];

  for (const item of targets) {
    const name = String(item.Name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    if (hasPhoto(item) && !force) {
      skipped += 1;
      results.push({ name, status: "skip", reason: "already has photo" });
      continue;
    }
    const invId = firstInvByItem.get(Number(item.id));
    const productUrl = invId ? urlByInv.get(invId) : null;
    if (!productUrl) {
      skipped += 1;
      results.push({ name, status: "skip", reason: "no product URL" });
      continue;
    }
    if (!/hillsprospect\.com/i.test(productUrl)) {
      skipped += 1;
      results.push({
        name,
        status: "skip",
        reason: "unsupported vendor host",
        productUrl,
      });
      continue;
    }

    try {
      const fetched = await fetchVendorImage(productUrl);
      if (!fetched.ok) {
        skipped += 1;
        results.push({
          name,
          status: "skip",
          reason: fetched.reason,
          productUrl,
          imageUrl: fetched.imageUrl,
        });
        await sleep(250);
        continue;
      }
      if (dryRun) {
        uploaded += 1;
        results.push({
          name,
          status: "would-upload",
          productUrl,
          imageUrl: fetched.imageUrl,
          bytes: fetched.bytes.byteLength,
        });
      } else {
        const attached = await uploadAndAttach(
          item.id,
          name,
          fetched.bytes,
          fetched.contentType,
          fetched.ext,
        );
        uploaded += 1;
        results.push({
          name,
          status: "uploaded",
          productUrl,
          imageUrl: fetched.imageUrl,
          attached,
        });
        console.log(`  ✓ ${name}`);
      }
    } catch (err) {
      skipped += 1;
      results.push({
        name,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
        productUrl,
      });
      console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(350);
  }

  console.log(
    JSON.stringify(
      {
        targets: targets.length,
        uploaded,
        skipped,
        dryRun,
        force,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
