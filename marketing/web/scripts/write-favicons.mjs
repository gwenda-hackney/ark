/**
 * Draw the site's icons in public/ from the SVG sources (#240):
 *   favicon.svg           the tab icon, copied as is
 *   favicon.ico           16 (the 16px drawing) and 32
 *   favicon.png           siteConfig.brand.faviconSize (96)
 *   apple-touch-icon.png  180, on the board colour, no transparency
 *   icon-192.png, icon-512.png  the same, for Android (site.webmanifest)
 * and, for the record the pages draw inline (ChartRecord.astro, the event
 * pages), src/lib/chart-record-drawings.js: the tab's and the home-screen
 * icon's drawings without the board.
 *
 * When proper artwork arrives, replace the SVGs in
 * src/assets/images/logos/icon/ and run:
 *   npm run generate:favicons
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import {
  ICON_SOURCES,
  packIco,
  recordDrawing,
  svgToPng,
} from "./lib/favicons.mjs";

const sourceDir = resolve(process.cwd(), "src/assets/images/logos/icon");
const outDir = resolve(process.cwd(), "public");
const source = (name) => readFileSync(resolve(sourceDir, ICON_SOURCES[name]));
const drawingsFile = resolve(process.cwd(), "src/lib/chart-record-drawings.js");

/** Match siteConfig.brand.faviconSize and .appIcons (a test holds them together). */
const faviconPngSize = 96;
const appIconSizes = [192, 512];
/** --ch-board in src/styles/chart.css */
const board = "#1a1510";

copyFileSync(
  resolve(sourceDir, ICON_SOURCES.tab),
  resolve(outDir, "favicon.svg"),
);

writeFileSync(
  resolve(outDir, "favicon.ico"),
  packIco([
    { size: 16, png: await svgToPng(source("small"), 16) },
    { size: 32, png: await svgToPng(source("tab"), 32) },
  ]),
);

writeFileSync(
  resolve(outDir, "favicon.png"),
  await svgToPng(source("tab"), faviconPngSize),
);

writeFileSync(
  resolve(outDir, "apple-touch-icon.png"),
  await svgToPng(source("app"), 180, { background: board }),
);

for (const size of appIconSizes) {
  writeFileSync(
    resolve(outDir, `icon-${size}.png`),
    await svgToPng(source("app"), size, { background: board }),
  );
}

const drawings = {
  small: recordDrawing(source("tab").toString()),
  large: recordDrawing(source("app").toString()),
};
const module = `/**
 * The record with the logo's skull, as the pages draw it inline (#240,
 * chart-record.js): the site icons' drawings without their board. Written
 * by npm run generate:favicons from src/assets/images/logos/icon/; redraw
 * the source and run that, don't edit this.
 *
 * small: the tab's drawing (${ICON_SOURCES.tab}), on whole pixels at 32: for
 *   a mark of 20 to 40px.
 * large: the home-screen icon's (${ICON_SOURCES.app}), with its grooves: for
 *   a frame.
 */
export const RECORD_DRAWINGS = ${JSON.stringify(drawings)};
`;
writeFileSync(
  drawingsFile,
  await format(module, {
    ...(await resolveConfig(drawingsFile)),
    filepath: drawingsFile,
  }),
);

console.log("Wrote public/favicon.svg, favicon.ico (16, 32)");
console.log(`Wrote public/favicon.png (${faviconPngSize})`);
console.log("Wrote public/apple-touch-icon.png (180, on the board)");
console.log(`Wrote public/icon-{${appIconSizes.join(",")}}.png (on the board)`);
console.log("Wrote src/lib/chart-record-drawings.js (small, large)");
