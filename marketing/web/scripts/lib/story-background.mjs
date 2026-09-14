/**
 * Render the story section background (elevated fill + gold glow + grain).
 * Matches .story and .grain in src/styles/global.css.
 */
import sharp from "sharp";

const GRAIN_TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <circle cx="40" cy="60" r="1" fill="#fff" opacity="0.4"/>
  <circle cx="120" cy="30" r="1" fill="#fff" opacity="0.3"/>
  <circle cx="80" cy="140" r="1" fill="#fff" opacity="0.5"/>
  <circle cx="160" cy="100" r="1" fill="#fff" opacity="0.35"/>
  <circle cx="20" cy="170" r="1" fill="#fff" opacity="0.45"/>
  <circle cx="180" cy="180" r="1" fill="#fff" opacity="0.3"/>
</svg>`;

export function storyBackgroundSvg(
  width,
  height,
  { bgElevated, gold },
) {
  const glowRadiusX = width * 0.45;
  const glowRadiusY = height * 0.275;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="story-glow" gradientUnits="userSpaceOnUse" cx="${width / 2}" cy="0" rx="${glowRadiusX}" ry="${glowRadiusY}">
      <stop offset="0%" stop-color="${gold}" stop-opacity="0.04"/>
      <stop offset="70%" stop-color="${gold}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grain" width="200" height="200" patternUnits="userSpaceOnUse">
      ${GRAIN_TILE.replace(/^<svg[^>]*>|<\/svg>$/g, "")}
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="${bgElevated}"/>
  <rect width="100%" height="100%" fill="url(#story-glow)"/>
  <rect width="100%" height="100%" fill="url(#grain)" opacity="0.035"/>
</svg>`;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(hexA, hexB, amountB) {
  const a = Number.parseInt(hexA.slice(1), 16);
  const b = Number.parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return rgbToHex(
    Math.round(ar + (br - ar) * amountB),
    Math.round(ag + (bg - ag) * amountB),
    Math.round(ab + (bb - ab) * amountB),
  );
}

/**
 * Flat story colour for print / solid fills.
 * Simulates on-screen warmth: elevated base + dispersed gold glow + slight lift.
 */
export function computeStoryPrintFlatHex({ bgElevated, gold, text }) {
  const withGlow = mixHex(bgElevated, gold, 0.06);
  return mixHex(withGlow, text, 0.02);
}

export async function sampleStoryBackgroundHex(image) {
  const { data, info } = await image
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
  }

  return rgbToHex(
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count),
  );
}

export async function renderStoryBackground(colors, { width = 1200, height = 800 } = {}) {
  const svg = storyBackgroundSvg(width, height, colors);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
