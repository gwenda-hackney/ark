/**
 * Seed menu sections and cocktail items into a Sanity dataset.
 *
 * Usage (from repo root):
 *   npm run studio:seed:dev
 *   CONFIRM_PRODUCTION_SEED=1 npm run studio:seed:production
 */
import { createClient } from "@sanity/client";
import { LexoRank } from "lexorank";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const imageDir = resolve(repoRoot, "web/src/assets/images/cocktails");

const dataset = process.env.SANITY_DATASET || "development";
const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const token = process.env.SANITY_API_TOKEN;

if (dataset === "production" && process.env.CONFIRM_PRODUCTION_SEED !== "1") {
  console.error(
    "Refusing to seed production without CONFIRM_PRODUCTION_SEED=1",
  );
  process.exit(1);
}

if (!token) {
  console.error("SANITY_API_TOKEN is required (Developer or Editor token with write access).");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2025-01-01",
  useCdn: false,
});

const TEST_IMAGES = [
  "cocktail1.png",
  "cocktail2.png",
  "cocktail3.png",
  "cocktail4.png",
  "coctail5.png",
  "cocktail6.png",
];

/** Bottom-weighted gallery crop — stored on each menuItem image in Sanity. */
const CROP_PRESETS = {
  "bottom-center": {
    crop: { top: 0.4, bottom: 0.06, left: 0.18, right: 0.18 },
    hotspot: { x: 0.5, y: 0.72, width: 0.44, height: 0.48 },
  },
  "bottom-right": {
    crop: { top: 0.3, bottom: 0.06, left: 0.38, right: 0.06 },
    hotspot: { x: 0.78, y: 0.66, width: 0.38, height: 0.52 },
  },
  "bottom-left": {
    crop: { top: 0.36, bottom: 0.06, left: 0.06, right: 0.36 },
    hotspot: { x: 0.28, y: 0.72, width: 0.4, height: 0.48 },
  },
};

function galleryCrop({ position = "bottom-center", crop = {}, hotspot = {} } = {}) {
  const base = CROP_PRESETS[position] ?? CROP_PRESETS["bottom-center"];
  return {
    crop: { ...base.crop, ...crop },
    hotspot: { ...base.hotspot, ...hotspot },
  };
}

/** Sequential LexoRanks matching Studio "Reset order" / drag ranking. */
function allocateOrderRanks(count) {
  const ranks = [];
  let rank = LexoRank.min();
  for (let i = 0; i < count; i += 1) {
    rank = rank.genNext().genNext();
    ranks.push(rank.toString());
  }
  return ranks;
}

const SIGNATURE_COCKTAILS = [
  {
    name: "Gwenda",
    imageFile: "cocktail1.png",
    ...galleryCrop({ position: "bottom-right" }),
    description:
      process.env.GWENDA_INGREDIENTS?.trim() ||
      "Gin | Prosecco | Italicus | Elderflower | Lime",
    notes: "Sweet & Citrusy",
    price: "15",
  },
  {
    name: "Kraken",
    imageFile: "cocktail2.png",
    ...galleryCrop({ position: "bottom-center" }),
    description:
      "Dark Rum | Coffee Liqueur | Cocoa Bitters | Maple Syrup | Oak Smoke",
    notes: "Dark & Decadent",
    price: "15",
  },
  {
    name: "Maestrale",
    imageFile: "cocktail3.png",
    ...galleryCrop({ position: "bottom-left" }),
    description: "Tequila | Lime | Grapefruit | Agave | Sea Salt",
    notes: "Crisp & Zesty",
    price: "15",
  },
  {
    name: "Ponente",
    imageFile: "cocktail4.png",
    ...galleryCrop({
      position: "bottom-right",
      crop: { top: 0.24, left: 0.34, bottom: 0.04, right: 0.04 },
      hotspot: { x: 0.76, y: 0.62, width: 0.36, height: 0.58 },
    }),
    description: "Campari Rosso | Italicus | Prosecco | Peach Soda",
    notes: "Herbal & Lively",
    price: "15",
  },
];

const ITALIAN_SPRITZERS = [
  {
    name: "Aperol Spritz",
    description: "Aperol | Prosecco | Soda | Orange",
    notes: "Bright & Citrusy",
    price: "12",
  },
  {
    name: "Campari Spritz",
    description: "Campari | Prosecco | Soda | Orange",
    notes: "Herbal & Vibrant",
    price: "12",
  },
  {
    name: "Hugo Spritz",
    description: "St-Germain | Prosecco | Soda | Lime",
    notes: "Floral & Refreshing",
    price: "12",
  },
  {
    name: "Limoncello Spritz",
    description: "Limoncello | Prosecco | Soda | Lemon",
    notes: "Zesty & Sweet",
    price: "12",
  },
];

const CLASSIC_COCKTAILS = [
  {
    name: "Margarita",
    description: "Tequila | Triple Sec | Lime | Sugar | Salt",
    notes: "Zesty & Salty",
    price: "12",
  },
  {
    name: "Whiskey Sour",
    description: "Whiskey | Lemon | Sugar | Aquafaba | Angostura Bitters",
    notes: "Rich & Citrusy",
    price: "13",
  },
  {
    name: "East 8 Hold Up",
    description:
      "Vodka | Aperol | Prosecco | Pineapple | Passion Fruit Syrup | Sugar",
    notes: "Tropical & Tangy",
    price: "13",
  },
  {
    name: "Negroni",
    description: "Gin | Campari | Sweet Vermouth | Orange",
    notes: "Complex & Herby",
    price: "13",
  },
  {
    name: "Smoky Negroni",
    description: "Mezcal | Campari | Sweet Vermouth | Orange",
    notes: "Smoky & Velvety",
    price: "13",
  },
  {
    name: "Bellini",
    description: "Prosecco | Peach Puree",
    notes: "Fresh & Elegant",
    price: "12",
  },
  {
    name: "Americano",
    description: "Campari | Sweet Vermouth | Soda",
    notes: "Herbal & Refreshing",
    price: "12",
  },
  {
    name: "Imperial Buck",
    description: "Dark Rum | Pineapple | Lime | Ginger Syrup",
    notes: "Spicy & Refreshing",
    price: "12",
  },
];

const MENU_SECTIONS = [
  {
    title: "Signature Cocktails",
    slug: "signature-cocktails",
    subtitle: "Original creations, crafted with passion and precision.",
    items: SIGNATURE_COCKTAILS,
    signature: true,
  },
  {
    title: "Italian Spritzers",
    slug: "italian-spritzers",
    subtitle: "Iconic aperitifs, inspired by Italian tradition.",
    items: ITALIAN_SPRITZERS,
    signature: false,
  },
  {
    title: "Classic Cocktails",
    slug: "classic-cocktails",
    subtitle: "Timeless classics, for every taste and occasion.",
    items: CLASSIC_COCKTAILS,
    signature: false,
  },
];

const SEEDED_SECTION_SLUGS = new Set(MENU_SECTIONS.map((section) => section.slug));

async function uploadImage(filename) {
  const filepath = resolve(imageDir, filename);
  const buffer = readFileSync(filepath);
  const asset = await client.assets.upload("image", buffer, {
    filename: basename(filepath),
    contentType: "image/png",
  });
  return asset._id;
}

function imageField(assetId, alt, { crop, hotspot } = {}) {
  return {
    _type: "image",
    alt,
    asset: {
      _type: "reference",
      _ref: assetId,
    },
    ...(crop ? { crop } : {}),
    ...(hotspot ? { hotspot } : {}),
  };
}

async function ensureSection({ title, slug, subtitle, orderRank }) {
  const existingId = await client.fetch(
    `*[_type == "menuSection" && slug.current == $slug][0]._id`,
    { slug },
  );

  const fields = {
    title,
    orderRank,
    slug: { _type: "slug", current: slug },
    ...(subtitle ? { subtitle } : {}),
  };

  if (existingId) {
    await client.patch(existingId).set(fields).unset(["sortOrder"]).commit();
    return existingId;
  }

  const created = await client.create({
    _type: "menuSection",
    ...fields,
  });
  return created._id;
}

async function ensureMenuItem(sectionId, cocktail, { signature = false, image, orderRank }) {
  // Match by name globally so items can move between sections on re-seed.
  const existingId = await client.fetch(
    `*[_type == "menuItem" && name == $name && !(_id in path("drafts.**"))][0]._id`,
    { name: cocktail.name },
  );

  const fields = {
    name: cocktail.name,
    description: cocktail.description,
    notes: cocktail.notes,
    price: cocktail.price,
    orderRank,
    signature,
    section: { _type: "reference", _ref: sectionId },
    ...(image ? { image } : {}),
  };

  if (existingId) {
    let patch = client.patch(existingId).set(fields).unset(["sortOrder"]);
    if (!image && signature === false) {
      // Non-signature items should not keep stale gallery photos.
      patch = patch.unset(["image"]);
    }
    if (cocktail.price == null) {
      patch = patch.unset(["price"]);
    }
    await patch.commit();
    return existingId;
  }

  const created = await client.create({
    _type: "menuItem",
    ...fields,
  });
  return created._id;
}

async function ensureSiteSettings() {
  const existing = await client.fetch(
    `*[_type == "siteSettings" && _id == "siteSettings"][0]._id`,
  );

  const fields = {
    bookingEnabled: false,
    cocktailGalleryEnabled: true,
  };

  if (existing) {
    await client.patch("siteSettings").set(fields).commit();
    return "siteSettings";
  }

  await client.createOrReplace({
    _id: "siteSettings",
    _type: "siteSettings",
    ...fields,
  });
  return "siteSettings";
}

async function removeObsoleteContent(keptItemIds) {
  const items = await client.fetch(
    `*[_type == "menuItem" && !(_id in path("drafts.**"))]{ _id, name }`,
  );
  const obsoleteItems = items.filter((item) => !keptItemIds.has(item._id));
  for (const item of obsoleteItems) {
    await client.delete(item._id);
    console.log(`  removed obsolete item: ${item.name}`);
  }

  const sections = await client.fetch(
    `*[_type == "menuSection" && !(_id in path("drafts.**"))]{ _id, title, "slug": slug.current }`,
  );
  for (const section of sections) {
    if (!SEEDED_SECTION_SLUGS.has(section.slug)) {
      await client.delete(section._id);
      console.log(`  removed obsolete section: ${section.title} (${section.slug})`);
    }
  }
}

async function main() {
  console.log(`Seeding ${projectId}/${dataset}…`);

  console.log("Ensuring site settings…");
  await ensureSiteSettings();
  console.log("  siteSettings (bookingEnabled: false, cocktailGalleryEnabled: true)");

  const sectionRanks = allocateOrderRanks(MENU_SECTIONS.length);

  console.log("Ensuring menu sections…");
  const sectionIds = {};
  for (const [index, section] of MENU_SECTIONS.entries()) {
    sectionIds[section.slug] = await ensureSection({
      ...section,
      orderRank: sectionRanks[index],
    });
    console.log(`  ${section.title} (${section.slug})`);
  }

  const needsImages = MENU_SECTIONS.some((section) =>
    section.items.some((item) => item.imageFile),
  );
  const assetByFile = {};
  if (needsImages) {
    console.log(`Uploading ${TEST_IMAGES.length} test images…`);
    for (const filename of TEST_IMAGES) {
      assetByFile[filename] = await uploadImage(filename);
      console.log(`  uploaded ${filename}`);
    }
  }

  const keptItemIds = new Set();
  let itemCount = 0;

  for (const section of MENU_SECTIONS) {
    const sectionId = sectionIds[section.slug];
    const itemRanks = allocateOrderRanks(section.items.length);
    console.log(`Seeding ${section.title}…`);
    for (const [index, cocktail] of section.items.entries()) {
      const image = cocktail.imageFile
        ? imageField(
            assetByFile[cocktail.imageFile],
            `${cocktail.name} · signature cocktail at Gwenda`,
            { crop: cocktail.crop, hotspot: cocktail.hotspot },
          )
        : undefined;
      const id = await ensureMenuItem(sectionId, cocktail, {
        signature: section.signature,
        image,
        orderRank: itemRanks[index],
      });
      keptItemIds.add(id);
      itemCount += 1;
      console.log(`  ${cocktail.name}`);
    }
  }

  console.log("Removing obsolete menu content…");
  await removeObsoleteContent(keptItemIds);

  console.log(
    `Done. Seeded ${dataset} menu (${MENU_SECTIONS.length} sections + ${itemCount} items).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
