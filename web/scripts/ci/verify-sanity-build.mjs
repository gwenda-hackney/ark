/**
 * Fail CI when a Sanity-backed build produced no menu content.
 * Catches private-dataset auth issues that otherwise bake empty HTML silently.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const home = readFileSync(resolve(distDir, "index.html"), "utf8");
const menu = readFileSync(resolve(distDir, "menu/index.html"), "utf8");

const datasetMatch = home.match(/cdn\.sanity\.io\/images\/pn5yjro6\/([^/"']+)/);
const dataset = datasetMatch?.[1] ?? "unknown";
const galleryTiles = (home.match(/menu-tease-cocktail/g) ?? []).length;
const menuEmpty = menu.includes("being prepared");
const hasComingSoon =
  home.includes("menu-tease-empty") || home.includes("Coming soon");

if (!datasetMatch) {
  console.error(
    [
      "Sanity dataset not found in build output — CMS fetch may have failed.",
      "Set GitHub secret SANITY_API_TOKEN to a Viewer token.",
    ].join("\n"),
  );
  process.exit(1);
}

if (galleryTiles > 0) {
  console.log(`Sanity build OK — dataset: ${dataset}, gallery tiles: ${galleryTiles}`);
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
    `  coming soon placeholder: ${hasComingSoon}`,
    `  menu page empty: ${menuEmpty}`,
    "",
    "Staging builds use the development dataset (gwenda-dev.sanity.studio).",
    "Set GitHub secret SANITY_API_TOKEN to a Viewer token (separate from SANITY_DEPLOY_TOKEN).",
    "Seed or publish menu content: npm run studio:seed:dev",
  ].join("\n"),
);
process.exit(1);
