/**
 * Render public/brand/story-background.png for off-site use (Canva, print).
 *
 * Run via: npm run generate:brand-assets
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import colors from "../src/config/colors.json" with { type: "json" };
import {
  computeStoryPrintFlatHex,
  renderStoryBackground,
  sampleStoryBackgroundHex,
} from "./lib/story-background.mjs";

const outPath = resolve(process.cwd(), "public/brand/story-background.png");

mkdirSync(resolve(process.cwd(), "public/brand"), { recursive: true });

const buffer = await renderStoryBackground(colors);
const sampledHex = await sampleStoryBackgroundHex(sharp(buffer));

await sharp(buffer).png().toFile(outPath);

console.log(`Wrote public/brand/story-background.png (sampled: ${sampledHex})`);
console.log(
  `Print flat colour: ${computeStoryPrintFlatHex(colors)} (${colors.bgStoryPrint})`,
);

if (sampledHex !== colors.bgStory) {
  console.warn(
    `Warning: sampled ${sampledHex} does not match colors.json bgStory (${colors.bgStory}). Update bgStory if the story CSS changed.`,
  );
}
