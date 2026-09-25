/**
 * Fail CI when a Sanity-backed build produced no menu content.
 * Catches private-dataset auth issues that otherwise bake empty HTML silently.
 *
 * Homepage cocktail gallery images are optional (siteSettings.cocktailGalleryEnabled).
 * A successful CMS fetch is proven by gallery tiles, Sanity CDN URLs, or menu sections
 * on /menu/.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const home = readFileSync(resolve(distDir, "index.html"), "utf8");
const menu = readFileSync(resolve(distDir, "menu/index.html"), "utf8");

const sanityImageRe = /cdn\.sanity\.io\/images\/pn5yjro6\/([^/"']+)/;
const datasetMatch = home.match(sanityImageRe) ?? menu.match(sanityImageRe);
const dataset = datasetMatch?.[1] ?? process.env.SANITY_DATASET ?? "unknown";
const galleryTiles = (home.match(/menu-tease-cocktail/g) ?? []).length;
const menuSections = (menu.match(/class="menu-section[\s"]/g) ?? []).length;
const menuEmpty = menu.includes("being prepared");
const hasComingSoon =
  home.includes("menu-tease-empty") || home.includes("Coming soon");

const hasCmsContent =
  Boolean(datasetMatch) || galleryTiles > 0 || menuSections > 0;

if (!hasCmsContent && !(hasComingSoon && menuEmpty)) {
  console.error(
    [
      "Sanity menu content missing from build output — CMS fetch may have failed.",
      "Set GitHub secret SANITY_API_TOKEN to a Viewer token.",
      `  dataset: ${dataset}`,
      `  gallery tiles: ${galleryTiles}`,
      `  menu sections: ${menuSections}`,
    ].join("\n"),
  );
  process.exit(1);
}

if (galleryTiles > 0) {
  console.log(`Sanity build OK — dataset: ${dataset}, gallery tiles: ${galleryTiles}`);
  process.exit(0);
}

if (hasComingSoon && galleryTiles === 0) {
  console.log(
    `Sanity build OK — dataset: ${dataset}, homepage cocktail gallery coming soon` +
      (menuSections > 0 ? `, menu sections: ${menuSections}` : ""),
  );
  process.exit(0);
}

if (menuSections > 0) {
  console.log(
    `Sanity build OK — dataset: ${dataset}, menu sections: ${menuSections}` +
      (galleryTiles === 0 ? " (homepage cocktail gallery off or empty)" : ""),
  );
  process.exit(0);
}

if (hasComingSoon && menuEmpty) {
  console.log(
    `Sanity build OK — dataset: ${dataset}, menu empty with coming-soon placeholders`,
  );
  process.exit(0);
}

console.error(
  [
    "Sanity menu content missing from build output.",
    `  dataset in HTML: ${dataset}`,
    `  gallery tiles: ${galleryTiles}`,
    `  menu sections: ${menuSections}`,
    `  coming soon placeholder: ${hasComingSoon}`,
    `  menu page empty: ${menuEmpty}`,
    "",
    "Staging builds use the staging dataset. Drafts are ignored.",
    "Set GitHub secret SANITY_API_TOKEN to a Viewer token (separate from SANITY_DEPLOY_TOKEN).",
    "Check the staging dataset has content, then rebuild.",
  ].join("\n"),
);
process.exit(1);
