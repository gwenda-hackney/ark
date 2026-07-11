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

if (menuEmpty || galleryTiles === 0) {
  console.error(
    [
      "Sanity menu content missing from build output.",
      `  dataset in HTML: ${dataset}`,
      `  gallery tiles: ${galleryTiles}`,
      `  menu page empty: ${menuEmpty}`,
      "",
      "Staging builds use the development dataset (gwenda-dev.sanity.studio).",
      "Ensure GitHub secret SANITY_API_TOKEN is a Deploy token with read access,",
      "then seed or publish menu content: npm run studio:seed:dev",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Sanity build OK — dataset: ${dataset}, gallery tiles: ${galleryTiles}`);
