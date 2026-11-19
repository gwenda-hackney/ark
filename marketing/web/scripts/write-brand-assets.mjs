/**
 * Sync stable public/ brand files from src/assets sources.
 *
 * Run when logo sources change:
 *   npm run generate:brand-assets
 *
 * The favicons and the home-screen icon are drawn by write-favicons.mjs.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import colors from "../src/config/colors.json" with { type: "json" };

const outDir = resolve(process.cwd(), "public");
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

/** Transparent wordmark for dark email backgrounds. */
await sharp(logoLayer).png().toFile(resolve(outDir, "brand/logo-email.png"));

console.log(
  `Wrote public/brand/logo-organization.png (${orgWidth}×${orgCanvasHeight}, ${colors.bg} background)`,
);
console.log("Wrote public/brand/logo-email.png (transparent wordmark)");
