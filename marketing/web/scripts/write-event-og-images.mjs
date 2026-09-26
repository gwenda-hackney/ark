/**
 * Download event hero images as self-hosted OG JPEGs (like logo-board.png on
 * the homepage). WhatsApp and other scrapers prefer same-origin images with
 * explicit image/jpeg type and a reasonable file size.
 *
 * Run before `astro build` — see web/package.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@sanity/client";
import { createImageUrlBuilder } from "@sanity/image-url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const outputDir = resolve(webRoot, "public/og/events");

const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const dataset = process.env.SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

const RSVP_EVENTS_QUERY = `*[_type == "event" && defined(slug.current) && removed != true] | order(date asc) {
  "slug": slug.current,
  title,
  heroImage {
    alt,
    crop,
    hotspot,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

function toImageSource(image) {
  const assetId = image?.asset?._id;
  if (!assetId) return null;
  return {
    _type: "image",
    asset: { _type: "reference", _ref: assetId },
    ...(image.crop ? { crop: image.crop } : {}),
    ...(image.hotspot ? { hotspot: image.hotspot } : {}),
  };
}

function buildSocialPreviewUrl(image) {
  const source = toImageSource(image);
  if (!source) return null;

  return createImageUrlBuilder({ projectId, dataset })
    .image(source)
    .width(1200)
    .height(630)
    .fit("crop")
    .format("jpg")
    .quality(85)
    .url();
}

async function main() {
  if (!token) {
    console.warn("write-event-og-images: SANITY_API_TOKEN missing — skipping.");
    return;
  }

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
    perspective: "published",
  });

  const docs = await client.fetch(RSVP_EVENTS_QUERY);
  await mkdir(outputDir, { recursive: true });

  let written = 0;
  for (const doc of docs) {
    const slug = doc.slug?.trim();
    if (!slug || !doc.heroImage) continue;

    const url = buildSocialPreviewUrl(doc.heroImage);
    if (!url) continue;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`  skipped ${slug}: image fetch ${response.status}`);
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const path = resolve(outputDir, `${slug}.jpg`);
    await writeFile(path, bytes);
    written += 1;
    console.log(`  ${slug}.jpg (${Math.round(bytes.length / 1024)} KB)`);
  }

  console.log(`Wrote ${written} event OG image(s) to public/og/events/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
