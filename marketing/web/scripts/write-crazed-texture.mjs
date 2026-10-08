/**
 * Draws the crazed dark-paper tile behind the map page (#240): hairline
 * cracks that wander and branch, each with a faint dark edge, over a
 * slightly uneven tone and a fine grain. Drawn on a 3x3 grid of copies so
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
for (let i = 0; i < 22; i++)
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
      body += `<path d="${d(p.pts, ox + 0.8, oy + 0.8)}" stroke="rgb(0,0,0)" stroke-opacity="0.55" stroke-width="${p.w + 0.4}"/>`;
      body += `<path d="${d(p.pts, ox, oy)}" stroke="rgb(232,218,188)" stroke-opacity="0.085" stroke-width="${p.w}"/>`;
    }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#0b0a08"/>
<filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 0 0.62  0 0 0 0.035 0"/></filter>
<filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="2" seed="5" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.36  0 0 0 0 0.2  0 0 0 0.06 -0.01"/></filter>
<rect width="${S}" height="${S}" filter="url(#m)"/><rect width="${S}" height="${S}" filter="url(#f)"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
await sharp(Buffer.from(svg))
  .webp({ quality: 92 })
  .toFile(
    new URL("../src/assets/images/texture/crazed.webp", import.meta.url)
      .pathname,
  );
