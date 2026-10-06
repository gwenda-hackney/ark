#!/usr/bin/env node
/**
 * Pull product photos from Hills Prospect (and similar vendor pages) onto
 * non-custom menu drinks: pours, packaged bottles, and draught beer.
 * Skips cocktails (Our Formulas / By the Book mixed drinks). Each photo goes
 * to Sanity, like one uploaded in ops (#183); the drink keeps its asset id
 * (Menu Items "Photo asset"). with-ops-env points at the Gwenda Dev project
 * unless SANITY_PROJECT_ID says otherwise. Drinks, recipes and supplier
 * links come through the menu repository (Baserow or D1, wherever the menu
 * lives).
 *
 * Usage:
 *   node scripts/with-ops-env.mjs node scripts/fetch-ops-menu-vendor-photos.mjs
 *   node scripts/with-ops-env.mjs node scripts/fetch-ops-menu-vendor-photos.mjs --dry-run
 *   node scripts/with-ops-env.mjs node scripts/fetch-ops-menu-vendor-photos.mjs --force
 */
import { menuRepository } from "../ops/site/src/menu/server/menu-repository.js";
import { sanityUploadImage } from "../ops/site/src/platform/sanity.js";
import { parseImageAssetId } from "../shared/sanity-image.js";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

if (!dryRun && !process.env.SANITY_API_TOKEN?.trim()) {
  console.error("Need SANITY_API_TOKEN");
  process.exit(1);
}

const TARGET_TYPES = new Set(["pour", "packaged", "beer"]);
const UA =
  "Mozilla/5.0 (compatible; GwendaOps/1.0; +https://gwenda.co.uk)";

function drinkType(record) {
  const raw = String(record.drinkType || "").trim().toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged") return raw;
  return "cocktail";
}

function hasPhoto(record) {
  return Boolean(parseImageAssetId(record.photoAsset) || record.legacyPhotoUrl);
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

async function uploadAndAttach(repo, itemId, name, bytes, contentType, ext) {
  const slug = String(name || "drink")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const asset = await sanityUploadImage(process.env, bytes, {
    filename: `${slug || "drink"}.${ext}`,
    contentType,
  });
  if (!parseImageAssetId(asset?._id)) {
    throw new Error("Sanity didn't take the photo");
  }
  await repo.update("menu_items", itemId, { photoAsset: asset._id });
  return asset._id;
}

async function main() {
  const repo = menuRepository(process.env);
  console.log(
    dryRun
      ? "Dry run: vendor photos for pour / packaged / beer…\n"
      : "Fetching vendor photos for pour / packaged / beer…\n",
  );

  const [items, ingredients, links] = await Promise.all([
    repo.list("menu_items"),
    repo.list("ingredients"),
    repo.list("inventory_suppliers"),
  ]);

  const urlByInv = new Map();
  for (const link of links) {
    const invId = String(link.inventoryId ?? "");
    const url = String(link.productUrl || "").trim();
    if (!invId || !url) continue;
    if (!urlByInv.has(invId)) urlByInv.set(invId, url);
  }

  const firstInvByItem = new Map();
  for (const line of ingredients) {
    if (!line.itemId || line.inventoryId == null) continue;
    if (!firstInvByItem.has(line.itemId)) firstInvByItem.set(line.itemId, String(line.inventoryId));
  }

  const targets = items.filter((row) => TARGET_TYPES.has(drinkType(row)));
  let uploaded = 0;
  let skipped = 0;
  const results = [];

  for (const item of targets) {
    const name = String(item.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    if (hasPhoto(item) && !force) {
      skipped += 1;
      results.push({ name, status: "skip", reason: "already has photo" });
      continue;
    }
    const invId = firstInvByItem.get(item.id);
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
          repo,
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
