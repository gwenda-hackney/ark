/**
 * Sync brand colour tokens from web/src/config/colors.json into brand/src/index.html.
 *
 *   npm run sync:brand          — write changes
 *   npm run sync:brand -- --check — exit 1 if out of date (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const colorsPath = resolve(root, "web/src/config/colors.json");
const brandHtmlPath = resolve(root, "brand/src/index.html");
const checkOnly = process.argv.includes("--check");

const colors = JSON.parse(readFileSync(colorsPath, "utf8"));

/** Site token → brand guidelines CSS custom property */
const tokenMap = [
  ["bg", "--bg"],
  ["bgElevated", "--bg-elevated"],
  ["bgStoryPrint", "--bg-warm"],
  ["bgCanalShadow", "--bg-canal-shadow"],
  ["bgDampTimber", "--bg-damp-timber"],
  ["bgVerdigris", "--bg-verdigris"],
  ["bgCard", "--bg-card"],
  ["text", "--text"],
  ["textMuted", "--muted"],
  ["gold", "--gold"],
  ["goldDark", "--gold-dark"],
  ["error", "--error"],
];

let html = readFileSync(brandHtmlPath, "utf8");
const rootBlock = /(:root\s*\{)([\s\S]*?)(\n\s*\})/m;

const match = html.match(rootBlock);
if (!match) {
  console.error("Could not find :root { } block in brand/src/index.html");
  process.exit(1);
}

const lines = tokenMap.map(([jsonKey, cssVar]) => {
  const value = colors[jsonKey];
  if (!value) {
    console.error(`Missing colour key in colors.json: ${jsonKey}`);
    process.exit(1);
  }
  const pad = cssVar.length >= 14 ? "" : " ".repeat(14 - cssVar.length);
  return `      ${cssVar}:${pad} ${value};`;
});

const fonts = [
  '      --font-display: "Cormorant Garamond", Georgia, serif;',
  '      --font-body:    "Lora", Georgia, serif;',
];

const newBlock = `${match[1]}\n${lines.join("\n")}\n${fonts.join("\n")}\n    }`;
const updated = html.replace(rootBlock, newBlock);

if (updated === html) {
  if (checkOnly) {
    console.log("brand/src/index.html colour tokens are up to date");
  } else {
    console.log("No colour token changes needed");
  }
  process.exit(0);
}

if (checkOnly) {
  console.error(
    "brand/src/index.html is out of sync with web/src/config/colors.json — run: npm run sync:brand",
  );
  process.exit(1);
}

writeFileSync(brandHtmlPath, updated);
console.log(
  "Updated brand/src/index.html colour tokens from web/src/config/colors.json",
);
