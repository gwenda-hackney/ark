/**
 * Clear previous SPA build artefacts under ops/site/src without touching
 * static tool folders (stock, breakeven, cashflow, gate, styles).
 */
import { existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");
const indexHtml = resolve(srcDir, "index.html");
const appDir = resolve(srcDir, "_app");
const assetsDir = resolve(srcDir, "assets");
const menuDir = resolve(srcDir, "menu");

if (existsSync(indexHtml)) unlinkSync(indexHtml);
if (existsSync(appDir)) rmSync(appDir, { recursive: true, force: true });
if (existsSync(assetsDir)) rmSync(assetsDir, { recursive: true, force: true });
if (existsSync(menuDir)) rmSync(menuDir, { recursive: true, force: true });

for (const name of readdirSync(srcDir)) {
  if (/^index-.*\.(js|css)(\.map)?$/.test(name)) {
    unlinkSync(resolve(srcDir, name));
  }
}

console.log("Cleared SPA build outputs under ops/site/src");
