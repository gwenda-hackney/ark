/**
 * Seed menu sections and items into a Sanity dataset (print menu structure).
 *
 * Usage (from repo root):
 *   npm run studio:seed:dev
 *   CONFIRM_PRODUCTION_SEED=1 npm run studio:seed:production
 *
 * Unbranded spirits use generic names (vodka, gin, mezcal…) — never "XXXX".
 * Bottled Beer section is created empty until products are confirmed.
 */
import { createClient } from "@sanity/client";
import { LexoRank } from "lexorank";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const imageDir = resolve(repoRoot, "marketing/web/src/assets/images/cocktails");

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
  console.error("SANITY_API_TOKEN is required (Editor token with write access).");
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

// ── Our Formulas (house creations) ──────────────────────────────────────────

const OUR_FORMULAS = [
  {
    name: "Gwenda",
    imageFile: "cocktail1.png",
    ...galleryCrop({ position: "bottom-right" }),
    description:
      process.env.GWENDA_INGREDIENTS?.trim() ||
      "Bombay gin, Italicus, elderflower liqueur, lime, soda, basil",
    notes: "Floral fizz",
    price: "13",
    signature: true,
  },
  {
    name: "The Wick",
    description: "Vodka, coconut water, blue curaçao, lime, soda",
    notes: "Cool coconut",
    price: "11",
  },
  {
    name: "Ponente",
    imageFile: "cocktail4.png",
    ...galleryCrop({
      position: "bottom-right",
      crop: { top: 0.24, left: 0.34, bottom: 0.04, right: 0.04 },
      hotspot: { x: 0.76, y: 0.62, width: 0.36, height: 0.58 },
    }),
    description: "Campari, gin, Amaro Montenegro, cherry, lemon",
    notes: "Bitter lemon",
    price: "12",
    signature: true,
  },
  {
    name: "Tramontana",
    description: "Grey Goose, Carta dry vermouth, cherry, saline, lemon",
    notes: "Salty cherry",
    price: "11",
  },
  {
    name: "Maestrale",
    imageFile: "cocktail3.png",
    ...galleryCrop({ position: "bottom-left" }),
    description: "Blanco tequila, grapefruit, lime, agave, sea salt",
    notes: "Salted grapefruit",
    price: "11",
    signature: true,
  },
  {
    name: "Aurelia",
    description: "Hendrick's gin, cucumber, pineapple, lemon, sugar syrup",
    notes: "Cucumber and pineapple",
    price: "11",
  },
  {
    name: "Paradise Lost",
    description: "Mezcal, passion fruit, lime, agave",
    notes: "Smoky passion fruit",
    price: "11",
  },
  {
    name: "Barbarossa",
    description: "Mezcal, strawberry syrup, chilli, lime, red wine",
    notes: "Smoke, strawberry, chilli",
    price: "11",
  },
  {
    name: "Ambra",
    description:
      "Vecchia Romagna cognac, banana syrup, tonka syrup, lemon, orange bitters",
    notes: "Banana and tonka",
    price: "12",
  },
  {
    name: "Scirocco",
    description: "Maker's Mark bourbon, fig syrup, cinnamon, orange bitters",
    notes: "Fig and cinnamon",
    price: "11",
  },
  {
    name: "Kraken",
    imageFile: "cocktail2.png",
    ...galleryCrop({ position: "bottom-center" }),
    description: "Appleton Estate rum, Borghetti, maple syrup, Angostura",
    notes: "Coffee and maple",
    price: "11",
    signature: true,
  },
];

// ── Free of Spirit ──────────────────────────────────────────────────────────

const FREE_OF_SPIRIT = [
  {
    name: "Apple Mint Fizz",
    description: "Apple juice, mint syrup, lemon, soda",
    price: "7",
  },
  {
    name: "Tropical Punch",
    description: "Pineapple juice, orange juice, lemon, soda",
    price: "7",
  },
  {
    name: "Virgin Sunrise",
    description: "Orange juice, grenadine, lemon",
    price: "7",
  },
  {
    name: "Pomegranate Sparkler",
    description: "Pomegranate juice, lemon, sugar syrup, soda",
    price: "7",
  },
];

// ── By the Book ─────────────────────────────────────────────────────────────

const SPRITZ = [
  { name: "Aperol Spritz", price: "9" },
  { name: "Hugo Spritz", price: "9" },
  { name: "Limoncello Spritz", price: "9" },
  { name: "Spinello Spritz", price: "9" },
];

const NEGRONI = [
  { name: "Negroni", price: "10" },
  { name: "Mezcal Negroni", price: "10" },
  { name: "Negroni Sbagliato", price: "10" },
  { name: "Boulevardier", price: "10" },
];

const SOUR = [
  { name: "Whiskey Sour", price: "10" },
  { name: "Amaretto Sour", price: "9" },
  { name: "Margarita", price: "9" },
  { name: "Spicy Margarita", price: "9" },
];

const HIGHBALL = [
  { name: "Moscow Mule", price: "10" },
  { name: "Gin and Tonic", price: "8" },
  { name: "Rum and Coke", price: "8" },
  { name: "Vodka Red Bull", price: "8" },
  { name: "Vodka Lemon", price: "8" },
];

// Classics: name + price only for now. Optional description/notes still supported in schema.
// Bottled beer products intentionally empty until confirmed.
const BOTTLED_BEER = [];

// ── The Cabinet ─────────────────────────────────────────────────────────────

const AMARO = [
  { name: "Amaro Montenegro", price: "6" },
  { name: "Vecchio Amaro Del Capo", price: "5" },
  { name: "Amaro Lucano", price: "5" },
];

const WHISKEY = [
  { name: "Jameson", price: "5" },
];

const GRAPPA = [
  { name: "Grappa", price: "5" },
  { name: "Grappa Barricata 1903 Mezzaluna", price: "6" },
  { name: "Grappa Diciotto Lune", price: "7" },
  { name: "Grappa Nardini Bianca", price: "6" },
];

const LIQUEURS = [
  { name: "Sambuca Molinari", price: "5" },
  { name: "Mirto Rosso", price: "5" },
];

const MENU_CHAPTERS = [
  {
    title: "Our Formulas",
    slug: "our-formulas",
    subtitle:
      "The definitive liquid experience. Elegant expressions crafted for candlelit evenings.",
    items: OUR_FORMULAS,
  },
  {
    title: "Free of Spirit",
    slug: "free-of-spirit",
    subtitle:
      "The mindful liquid experience. Zero-proof expressions crafted with the same complexity.",
    items: FREE_OF_SPIRIT,
  },
  {
    title: "By the Book",
    slug: "by-the-book",
    subtitle: "The traditional liquid ritual. Timeless serves, made as you know them.",
    items: [],
    subsections: [
      { title: "Spritz", slug: "spritz", items: SPRITZ },
      { title: "Negroni", slug: "negroni", items: NEGRONI },
      { title: "Sour", slug: "sour", items: SOUR },
      { title: "Highball", slug: "highball", items: HIGHBALL },
      {
        title: "Bottled Beer",
        slug: "bottled-beer",
        items: BOTTLED_BEER,
      },
    ],
  },
  {
    title: "The Cabinet",
    slug: "the-cabinet",
    subtitle: "The liquid cabinet. Amaro, grappa, and whiskey for the quieter close.",
    items: [],
    subsections: [
      { title: "Amaro", slug: "amaro", items: AMARO },
      { title: "Whiskey", slug: "whiskey", items: WHISKEY },
      { title: "Grappa", slug: "grappa", items: GRAPPA },
      { title: "Liqueurs", slug: "liqueurs", items: LIQUEURS },
    ],
  },
];

/** Flat list for seeding + obsolete cleanup (chapters then subsections). */
const MENU_SECTIONS = MENU_CHAPTERS.flatMap((chapter) => [
  chapter,
  ...(chapter.subsections ?? []).map((sub) => ({
    ...sub,
    parentSlug: chapter.slug,
  })),
]);

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

async function ensureSection({ title, slug, subtitle, orderRank, parentId }) {
  const existingId = await client.fetch(
    `*[_type == "menuSection" && slug.current == $slug][0]._id`,
    { slug },
  );

  const fields = {
    title,
    orderRank,
    slug: { _type: "slug", current: slug },
    ...(subtitle ? { subtitle } : {}),
    ...(parentId
      ? { parent: { _type: "reference", _ref: parentId } }
      : {}),
  };

  const unsetFields = ["sortOrder"];
  if (!subtitle) unsetFields.push("subtitle");
  if (!parentId) unsetFields.push("parent");

  if (existingId) {
    await client.patch(existingId).set(fields).unset(unsetFields).commit();
    return existingId;
  }

  const created = await client.create({
    _type: "menuSection",
    ...fields,
  });
  return created._id;
}

async function ensureMenuItem(sectionId, cocktail, { image, orderRank }) {
  const existingId = await client.fetch(
    `*[_type == "menuItem" && name == $name && !(_id in path("drafts.**"))][0]._id`,
    { name: cocktail.name },
  );

  const signature = cocktail.signature === true;
  const description = cocktail.description?.trim() || undefined;
  const notes = cocktail.notes?.trim() || undefined;
  const price = cocktail.price == null ? undefined : String(cocktail.price);
  const abv = cocktail.abv?.trim() || undefined;
  const volume = cocktail.volume?.trim() || undefined;
  const producer = cocktail.producer?.trim() || undefined;

  const fields = {
    name: cocktail.name,
    orderRank,
    signature,
    section: { _type: "reference", _ref: sectionId },
    ...(description ? { description } : {}),
    ...(notes ? { notes } : {}),
    ...(price != null ? { price } : {}),
    ...(abv ? { abv } : {}),
    ...(volume ? { volume } : {}),
    ...(producer ? { producer } : {}),
    ...(image ? { image } : {}),
  };

  const unsetFields = ["sortOrder"];
  if (!description) unsetFields.push("description");
  if (!notes) unsetFields.push("notes");
  if (price == null) unsetFields.push("price");
  if (!abv) unsetFields.push("abv");
  if (!volume) unsetFields.push("volume");
  if (!producer) unsetFields.push("producer");
  if (!image && !signature) unsetFields.push("image");

  if (existingId) {
    await client.patch(existingId).set(fields).unset(unsetFields).commit();
    return existingId;
  }

  const created = await client.create({
    _type: "menuItem",
    ...fields,
  });
  return created._id;
}

/** Create siteSettings only when missing. Never overwrite live flags. */
async function ensureSiteSettings() {
  const existing = await client.fetch(
    `*[_type == "siteSettings" && _id == "siteSettings"][0]{
      _id,
      bookingEnabled,
      cocktailGalleryEnabled
    }`,
  );

  if (existing) {
    return existing;
  }

  await client.createOrReplace({
    _id: "siteSettings",
    _type: "siteSettings",
    bookingEnabled: false,
    cocktailGalleryEnabled: true,
  });
  return {
    _id: "siteSettings",
    bookingEnabled: false,
    cocktailGalleryEnabled: true,
  };
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
  const siteSettings = await ensureSiteSettings();
  console.log(
    `  siteSettings (bookingEnabled: ${Boolean(siteSettings.bookingEnabled)}, cocktailGalleryEnabled: ${siteSettings.cocktailGalleryEnabled !== false})`,
  );

  const sectionRanks = allocateOrderRanks(MENU_SECTIONS.length);

  console.log("Ensuring menu sections…");
  const sectionIds = {};
  for (const [index, section] of MENU_SECTIONS.entries()) {
    const parentId = section.parentSlug ? sectionIds[section.parentSlug] : undefined;
    if (section.parentSlug && !parentId) {
      throw new Error(
        `Parent section "${section.parentSlug}" must be seeded before "${section.slug}".`,
      );
    }
    sectionIds[section.slug] = await ensureSection({
      title: section.title,
      slug: section.slug,
      subtitle: section.subtitle,
      orderRank: sectionRanks[index],
      parentId,
    });
    console.log(
      `  ${section.parentSlug ? "↳ " : ""}${section.title} (${section.slug}) — ${section.items.length} item(s)`,
    );
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
    if (section.items.length === 0) {
      console.log(`Seeding ${section.title}… (empty — skipping items)`);
      continue;
    }
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
    `Done. Seeded ${dataset} menu (${MENU_CHAPTERS.length} chapters · ${MENU_SECTIONS.length} sections + ${itemCount} items).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
