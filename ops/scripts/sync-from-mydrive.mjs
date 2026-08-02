#!/usr/bin/env node
/**
 * Copy the working stock HTML from mydrive into ops/src/stock for publish.
 * Source of truth: mydrive/operations/stock/master-stock-pricing.html
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const opsRoot = resolve(here, "..");
const workspaceRoot = resolve(opsRoot, "../..");
const source = resolve(
  workspaceRoot,
  "mydrive/operations/stock/master-stock-pricing.html",
);
const destDir = resolve(opsRoot, "src/stock");
const dest = resolve(destDir, "index.html");

if (!existsSync(source)) {
  console.error(`Missing source: ${source}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);

let html = readFileSync(dest, "utf8");
if (!/name=["']robots["']/i.test(html)) {
  html = html.replace(
    /<meta charset="utf-8">/i,
    `<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">`,
  );
  writeFileSync(dest, html);
}

console.log(`Synced → ${dest}`);
