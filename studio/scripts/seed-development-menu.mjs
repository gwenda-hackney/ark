/**
 * Seed development dataset menu sections and cocktail items.
 *
 * Usage (from repo root):
 *   node --env-file=.env studio/scripts/seed-development-menu.mjs
 */
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const imageDir = resolve(repoRoot, "web/src/assets/images/cocktails");

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || "pn5yjro6",
  dataset: process.env.SANITY_DATASET || "development",
  token: process.env.SANITY_API_TOKEN,
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

const MENU_SECTIONS = [
  {
    title: "Signature Cocktails",
    slug: "signature-cocktails",
    sortOrder: 0,
    subtitle: "Hand-crafted in-house, elevated for the lounge.",
  },
  {
    title: "Traditional Cocktails",
    slug: "traditional-cocktails",
    sortOrder: 1,
    subtitle: "Classics, done properly.",
  },
];

/**
 * Development signature cocktails — names and placeholder copy for testing.
 */
const SIGNATURE_COCKTAILS = [
  {
    name: "Gwenda",
    description:
      process.env.GWENDA_INGREDIENTS?.trim() ||
      "Tanqueray No. Ten, Italicus, lavender honey, lemon, prosecco float",
    notes: "Aperitif",
    price: "12",
  },
  {
    name: "Canal Bloom",
    description: "Vodka, elderflower, cucumber, garden mint, soda",
    notes: "Long & spritzy",
    price: "12",
  },
  {
    name: "Wick Lantern Sour",
    description: "Mezcal, Aperol, passion fruit, lime, a whisper of Tajín",
    notes: "Sour",
    price: "12",
  },
  {
    name: "Night Archive",
    description: "Aged rum, cold-brew, banana liqueur, cacao, salted cream",
    notes: "After dark",
    price: "12",
  },
];

/** Standard classics for the traditional section — no homepage gallery photos. */
const TRADITIONAL_COCKTAILS = [
  {
    name: "Old Fashioned",
    description: "Bourbon, sugar, Angostura bitters, orange peel",
    notes: "Stirred",
    price: "12",
  },
  {
    name: "Negroni",
    description: "Gin, Campari, sweet vermouth, orange peel",
    notes: "Aperitif",
    price: "12",
  },
  {
    name: "Martini",
    description: "Gin, dry vermouth, lemon twist or olive",
    notes: "Stirred",
    price: "12",
  },
  {
    name: "Manhattan",
    description: "Rye, sweet vermouth, Angostura bitters, cherry",
    notes: "Stirred",
    price: "13",
  },
  {
    name: "Whiskey Sour",
    description: "Bourbon, lemon, sugar, egg white",
    notes: "Sour",
    price: "12",
  },
  {
    name: "Daiquiri",
    description: "White rum, lime, sugar",
    notes: "Sour",
    price: "11",
  },
];

async function uploadImage(filename) {
  const filepath = resolve(imageDir, filename);
  const buffer = readFileSync(filepath);
  const asset = await client.assets.upload("image", buffer, {
    filename: basename(filepath),
    contentType: "image/png",
  });
  return asset._id;
}

function imageField(assetId, alt) {
  return {
    _type: "image",
    alt,
    asset: {
      _type: "reference",
      _ref: assetId,
    },
  };
}

async function ensureSection({ title, slug, sortOrder, subtitle }) {
  const existingId = await client.fetch(
    `*[_type == "menuSection" && slug.current == $slug][0]._id`,
    { slug },
  );

  const fields = {
    title,
    sortOrder,
    slug: { _type: "slug", current: slug },
    ...(subtitle ? { subtitle } : {}),
  };

  if (existingId) {
    await client.patch(existingId).set(fields).commit();
    return existingId;
  }

  const created = await client.create({
    _type: "menuSection",
    ...fields,
  });
  return created._id;
}

async function ensureMenuItem(sectionId, cocktail, index, { signature = false, image }) {
  const existingId = await client.fetch(
    `*[_type == "menuItem" && section._ref == $sectionId && name == $name && !(_id in path("drafts.**"))][0]._id`,
    { sectionId, name: cocktail.name },
  );

  const fields = {
    name: cocktail.name,
    description: cocktail.description,
    notes: cocktail.notes,
    price: cocktail.price,
    sortOrder: index,
    signature,
    section: { _type: "reference", _ref: sectionId },
    ...(image ? { image } : {}),
  };

  if (existingId) {
    await client.patch(existingId).set(fields).commit();
    return existingId;
  }

  const created = await client.create({
    _type: "menuItem",
    ...fields,
  });
  return created._id;
}

async function main() {
  console.log("Ensuring menu sections…");
  const sectionIds = {};
  for (const section of MENU_SECTIONS) {
    sectionIds[section.slug] = await ensureSection(section);
    console.log(`  ${section.title} (${section.slug})`);
  }

  const signatureSectionId = sectionIds["signature-cocktails"];
  const traditionalSectionId = sectionIds["traditional-cocktails"];

  console.log(`Uploading ${TEST_IMAGES.length} test images for signature cocktails…`);
  const assetIds = [];
  for (const filename of TEST_IMAGES) {
    const assetId = await uploadImage(filename);
    assetIds.push(assetId);
    console.log(`  uploaded ${filename}`);
  }

  console.log("Seeding signature cocktails…");
  for (const [index, cocktail] of SIGNATURE_COCKTAILS.entries()) {
    const assetId = assetIds[index % assetIds.length];
    await ensureMenuItem(signatureSectionId, cocktail, index, {
      signature: true,
      image: imageField(assetId, `${cocktail.name} — signature cocktail at Gwenda`),
    });
    console.log(`  ${cocktail.name}`);
  }

  console.log("Seeding traditional cocktails…");
  for (const [index, cocktail] of TRADITIONAL_COCKTAILS.entries()) {
    await ensureMenuItem(traditionalSectionId, cocktail, index, {
      signature: false,
    });
    console.log(`  ${cocktail.name}`);
  }

  console.log("Done. Refresh the site to see both menu sections.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
