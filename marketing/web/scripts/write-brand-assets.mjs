/**
 * Sync stable public/ brand files from src/assets sources.
 *
 * Run when favicon or logo sources change:
 *   npm run generate:brand-assets
 */
import { mkdirSync, writeFileSync } from "node:fs";
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

/** Transparent wordmark for dark email backgrounds. */
await sharp(logoLayer).png().toFile(resolve(outDir, "brand/logo-email.png"));

/** Apple Wallet pass images (see Wallet Human Interface Guidelines). */
const walletDir = resolve(outDir, "brand/wallet");
mkdirSync(walletDir, { recursive: true });

const walletBackground = {
  r: Number.parseInt(colors.bg.slice(1, 3), 16),
  g: Number.parseInt(colors.bg.slice(3, 5), 16),
  b: Number.parseInt(colors.bg.slice(5, 7), 16),
  alpha: 1,
};

/** file → PNG buffer, embedded as base64 into wallet-brand-assets.generated.js so Wallet
 * pass generation never has to fetch our own site over HTTP (see that module for why). */
const walletAssetBuffers = {};

async function writeWalletLogo(file, width, height) {
  const fitted = await sharp(logoSrc)
    .resize(width, height, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  const png = await sharp(fitted).png().toBuffer();
  walletAssetBuffers[file] = png;
  await sharp(png).toFile(resolve(walletDir, file));
}

async function writeWalletIcon(file, size) {
  const outPath = resolve(walletDir, file);
  await writePaddedSquareIcon(faviconSrc, size, outPath);
  const { readFileSync } = await import("node:fs");
  walletAssetBuffers[file] = readFileSync(outPath);
}

async function writeWalletStripFallback(file, width, height) {
  const logoWidth = Math.round(width * 0.42);
  const logoHeight = Math.max(24, Math.round(height * 0.55));
  const fitted = await sharp(logoSrc)
    .resize(logoWidth, logoHeight, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const png = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: walletBackground,
    },
  })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
  walletAssetBuffers[file] = png;
  await sharp(png).toFile(resolve(walletDir, file));
}

const walletLogoSizes = [
  ["logo.png", 160, 50],
  ["logo@2x.png", 320, 100],
  ["logo@3x.png", 480, 150],
];
for (const [file, width, height] of walletLogoSizes) {
  await writeWalletLogo(file, width, height);
}

const walletIconSizes = [
  ["icon.png", 29],
  ["icon@2x.png", 58],
  ["icon@3x.png", 87],
];
for (const [file, size] of walletIconSizes) {
  await writeWalletIcon(file, size);
}

const walletStripSizes = [
  ["strip-fallback.png", 375, 98],
  ["strip-fallback@2x.png", 750, 196],
  ["strip-fallback@3x.png", 1125, 294],
];
for (const [file, width, height] of walletStripSizes) {
  await writeWalletStripFallback(file, width, height);
}

console.log("Wrote public/favicon.png (from favicon-light.png)");
console.log("Wrote public/favicon.ico");
console.log("Wrote public/apple-touch-icon.png");
console.log(
  `Wrote public/brand/logo-organization.png (${orgWidth}×${orgCanvasHeight}, ${colors.bg} background)`,
);
console.log("Wrote public/brand/logo-email.png (transparent wordmark)");
console.log("Wrote public/brand/wallet/* (Apple Wallet pass images)");

/**
 * Bundle the wallet brand images as base64 in a JS module that ships with the
 * Worker/Node bundle. Apple Wallet pass generation reads these directly instead
 * of fetching /brand/wallet/*.png over HTTP from our own origin — that self-fetch
 * was the root cause of blank Wallet icons (a devcontainer tunnel or a
 * not-yet-deployed asset can both make the request come back as a 200 HTML
 * fallback page instead of the image, silently corrupting the pass).
 */
const generatedModulePath = resolve(
  process.cwd(),
  "functions/_lib/wallet-brand-assets.generated.js",
);
const entries = Object.entries(walletAssetBuffers)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, buffer]) => `  "${file}": "${buffer.toString("base64")}",`)
  .join("\n");
writeFileSync(
  generatedModulePath,
  `// AUTO-GENERATED by scripts/write-brand-assets.mjs — do not edit by hand.\n` +
    `// Run \`npm run generate:brand-assets\` to regenerate after changing brand images.\n` +
    `export const WALLET_BRAND_ASSETS = {\n${entries}\n};\n`,
);
console.log(
  `Wrote functions/_lib/wallet-brand-assets.generated.js (${Object.keys(walletAssetBuffers).length} files)`,
);
