/**
 * The hero's logo on home (#240), at the widths it is drawn at: the first
 * thing a visitor sees, so it must arrive first (lib/chart-assets.ts,
 * chartHeroLogo).
 *
 * The drawing is cream, mustard and a little red with a worn print's speckle,
 * which a lossy encoder spends its bytes on: astro:assets' WebP of it is
 * 190 KB at 864px. Cut to 16 colours and kept lossless it looks the same and
 * is a third of that, so these files are made here once and used as they are,
 * not through astro:assets (which can only re-encode them lossy).
 *
 * Run when bottle.png changes:
 *   node scripts/write-hero-logo.mjs
 */
import sharp from "sharp";

const src = new URL("../src/assets/images/logos/bottle.png", import.meta.url)
  .pathname;
/**
 * 432 is its widest on the page (27rem); 864 is that at 2x, and near what a
 * phone at 3x wants (82vw); 320 and 640 are a phone's 82vw at 1x and 2x.
 */
const HERO_LOGO_WIDTHS = [320, 432, 640, 864];

for (const width of HERO_LOGO_WIDTHS) {
  const out = new URL(
    `../src/assets/images/logos/bottle-hero-${width}.webp`,
    import.meta.url,
  ).pathname;
  const quantised = await sharp(src)
    .resize({ width })
    .png({ palette: true, colours: 16, effort: 10, dither: 1 })
    .toBuffer();
  const info = await sharp(quantised)
    .webp({ lossless: true, effort: 6 })
    .toFile(out);
  console.log(
    `${out}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`,
  );
}
