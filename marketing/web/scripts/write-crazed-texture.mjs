/**
 * Draws the crazed dark-paper tile behind every Chart page (#240): hairline
 * cracks that wander and branch, each with a faint dark edge, over a
 * slightly uneven tone. No fine grain: it would not compress, and lossy
 * WebP turns the dark tone into visible blocks, so the tile is lossless. Drawn on a 3x3 grid of copies so
 * the tile repeats without a seam. Seeded, so it comes out the same.
 *
 *   node scripts/write-crazed-texture.mjs
 */
import sharp from "sharp";
const S = 900;
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const paths = [];
function crack(x, y, a, len, depth) {
  const pts = [[x, y]];
  let step = 0;
  while (step < len) {
    a += (rnd() - 0.5) * 0.9;
    const d = 5 + rnd() * 9;
    x += Math.cos(a) * d;
    y += Math.sin(a) * d;
    step += d;
    pts.push([x, y]);
    if (depth < 2 && rnd() < 0.05)
      crack(
        x,
        y,
        a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.8),
        len * (0.25 + rnd() * 0.35),
        depth + 1,
      );
  }
  paths.push({ pts, w: depth === 0 ? 1.1 : 0.8 });
}
for (let i = 0; i < 28; i++)
  crack(rnd() * S, rnd() * S, rnd() * Math.PI * 2, 120 + rnd() * 380, 0);
const d = (pts, ox, oy) =>
  "M" +
  pts
    .map(([x, y]) => `${(x + ox).toFixed(1)} ${(y + oy).toFixed(1)}`)
    .join(" L");
let body = "";
for (const ox of [-S, 0, S])
  for (const oy of [-S, 0, S])
    for (const p of paths) {
      body += `<path d="${d(p.pts, ox + 0.8, oy + 0.8)}" stroke="rgb(0,0,0)" stroke-opacity="0.7" stroke-width="${p.w + 0.4}"/>`;
      body += `<path d="${d(p.pts, ox, oy)}" stroke="rgb(232,218,188)" stroke-opacity="0.13" stroke-width="${p.w}"/>`;
    }
/**
 * Value noise on a lattice of `cells` per side that wraps at S. The tone
 * is drawn here rather than with feTurbulence: sharp's renderer ignores
 * stitchTiles, which left a step at every tile edge.
 */
function valueNoise(cells) {
  const grid = Array.from({ length: cells * cells }, rnd);
  const at = (i, j) =>
    grid[
      (((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)
    ];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / S) * cells;
    const fy = (y / S) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fade(fx - i);
    const v = fade(fy - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return top + (bottom - top) * v;
  };
}
const broad = valueNoise(4);
const finer = valueNoise(9);
const base = [11, 10, 8];
const stain = [128, 92, 51];
const tone = Buffer.alloc(S * S * 3);
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const n = broad(x, y) * 0.65 + finer(x, y) * 0.35;
    const a = Math.max(0, n * 0.08 - 0.01);
    for (let c = 0; c < 3; c++)
      tone[(y * S + x) * 3 + c] = Math.round(
        base[c] + (stain[c] - base[c]) * a,
      );
  }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
<g fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
await sharp(tone, { raw: { width: S, height: S, channels: 3 } })
  .composite([{ input: Buffer.from(svg) }])
  .webp({ lossless: true })
  .toFile(
    new URL("../src/assets/images/texture/crazed.webp", import.meta.url)
      .pathname,
  );
