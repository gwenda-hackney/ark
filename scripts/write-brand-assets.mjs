/**
 * Sync stable public/ brand files from src/assets sources.
 *
 * Run when favicon or logo sources change:
 *   npm run generate:brand-assets
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const outDir = resolve(process.cwd(), "public");
const faviconSrc = resolve(
  process.cwd(),
  "src/assets/images/logos/favicon-light.png",
);
const logoSrc = resolve(process.cwd(), "src/assets/images/logos/logo.png");

/** Google Organization logo: min 112×112. Site brand background. */
const organizationLogoWidth = 512;
const brandBackground = { r: 13, g: 13, b: 13, alpha: 1 };

mkdirSync(resolve(outDir, "brand"), { recursive: true });

copyFileSync(faviconSrc, resolve(outDir, "favicon.png"));

const appleTouch = spawnSync(
  "convert",
  [faviconSrc, "-resize", "180x180", resolve(outDir, "apple-touch-icon.png")],
  { encoding: "utf8" },
);
if (appleTouch.status !== 0) {
  copyFileSync(faviconSrc, resolve(outDir, "apple-touch-icon.png"));
}

const ico = spawnSync(
  "convert",
  [
    faviconSrc,
    "-define",
    "icon:auto-resize=96,48,32,16",
    resolve(outDir, "favicon.ico"),
  ],
  { encoding: "utf8" },
);
if (ico.status !== 0) {
  console.error("convert failed — install ImageMagick to generate favicon.ico");
  process.exit(1);
}

const logoMeta = await sharp(logoSrc).metadata();
const orgHeight = Math.max(
  112,
  Math.round(
    ((logoMeta.height ?? organizationLogoWidth) /
      (logoMeta.width ?? organizationLogoWidth)) *
      organizationLogoWidth,
  ),
);

const logoLayer = await sharp(logoSrc)
  .resize(organizationLogoWidth, orgHeight, {
    fit: "inside",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toBuffer();

const orgLogoMeta = await sharp(logoLayer).metadata();
const orgWidth = orgLogoMeta.width ?? organizationLogoWidth;
const orgLogoHeight = orgLogoMeta.height ?? orgHeight;

await sharp({
  create: {
    width: orgWidth,
    height: orgLogoHeight,
    channels: 4,
    background: brandBackground,
  },
})
  .composite([{ input: logoLayer, gravity: "center" }])
  .png()
  .toFile(resolve(outDir, "brand/logo-organization.png"));

console.log("Wrote public/favicon.png (from favicon-light.png)");
console.log("Wrote public/favicon.ico");
console.log("Wrote public/apple-touch-icon.png");
console.log(
  `Wrote public/brand/logo-organization.png (${orgWidth}×${orgLogoHeight}, #0d0d0d background)`,
);
