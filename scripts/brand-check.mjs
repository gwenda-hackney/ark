#!/usr/bin/env node
/**
 * Refuse anything in docs/brand/ that would bloat the clone: only WebP, each
 * under the size cap. Run by the PR checks when that folder changes.
 *
 *   npm run brand:check
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRAND_DIR, MAX_BYTES } from "./lib/brand-images.mjs";

const problems = [];
for (const file of readdirSync(BRAND_DIR)) {
  if (file === "README.md") continue;
  const bytes = statSync(join(BRAND_DIR, file)).size;
  if (!file.endsWith(".webp")) problems.push(`${file}: not a WebP (run npm run brand:add -- <file> instead of copying it in)`);
  else if (bytes > MAX_BYTES) problems.push(`${file}: ${Math.round(bytes / 1024)}KB, over the ${MAX_BYTES / 1024}KB cap`);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`docs/brand: ${readdirSync(BRAND_DIR).filter((f) => f.endsWith(".webp")).length} images, all within limits`);
