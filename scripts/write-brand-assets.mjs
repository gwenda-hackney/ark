/**
 * Sync stable public/ brand files from src/assets sources.
 *
 * Run when favicon or logo sources change:
 *   npm run generate:brand-assets
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import colors from "../src/config/colors.json" with { type: "json" };

const outDir = resolve(process.cwd(), "public");
const faviconSrc = resolve(
  process.cwd(),
  "src/assets/images/logos/favicon-light.png",
);
const logoSrc = resolve(process.cwd(), "src/assets/images/logos/logo.png");

/** Google Organization logo: min 112×112, square preferred. Site brand background. */
const organizationLogoWidth = 512;
const brandBackground = {
  r: Number.parseInt(colors.bg.slice(1, 3), 16),
  g: Number.parseInt(colors.bg.slice(3, 5), 16),
  b: Number.parseInt(colors.bg.slice(5, 7), 16),
  alpha: 1,
};
/** Top/bottom inset so logos aren't flush in Google rich-result previews. */
const verticalPaddingRatio = 0.12;

mkdirSync(resolve(outDir, "brand"), { recursive: true });

async function writePaddedSquareIcon(sourcePath, size, outPath) {
  const inner = Math.round(size * (1 - 2 * verticalPaddingRatio));
  const scaled = await sharp(sourcePath)
    .resize(inner, inner, {
      fit: "inside",
      background: brandBackground,
    })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: brandBackground,
    },
  })
    .composite([{ input: scaled, gravity: "center" }])
    .png()
    .toFile(outPath);
}

const faviconPngPath = resolve(outDir, "favicon.png");
await writePaddedSquareIcon(faviconSrc, 96, faviconPngPath);
await writePaddedSquareIcon(
  faviconSrc,
  180,
  resolve(outDir, "apple-touch-icon.png"),
);

const ico = spawnSync(
  "convert",
  [
    faviconPngPath,
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
const orgPaddingY = Math.round(orgLogoHeight * verticalPaddingRatio);
const orgCanvasHeight = orgLogoHeight + orgPaddingY * 2;

await sharp({
  create: {
    width: orgWidth,
    height: orgCanvasHeight,
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
  `Wrote public/brand/logo-organization.png (${orgWidth}×${orgCanvasHeight}, ${colors.bg} background)`,
);
