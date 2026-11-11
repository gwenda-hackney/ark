/**
 * Draws the old cracked leather behind every Chart page (#240): one tile
 * that repeats without a seam. Seeded, so it comes out the same.
 *
 * It is a height map, lit from the top left:
 *  - plates: the cells of a Voronoi diagram that wraps at the tile's edge,
 *    their borders bent by noise. Each border is a crack with its own width
 *    (some barely there), so the cracks join up into a net, as craquelure
 *    does. The plates curl up a little at their edges.
 *  - finer cracks inside the plates, in patches, where the hide is more worn.
 *  - grain: pebbles a few pixels across, and a finer tooth.
 * The colour is a near-black brown that drifts warmer and cooler across the
 * tile, darkest down in the cracks.
 *
 *   node scripts/write-leather-texture.mjs [out.webp]
 *
 * The tile is drawn at SCALE device pixels per CSS pixel; styles/chart.css
 * sets its background-size to SIZE.
 */
import sharp from "sharp";

const SIZE = 720; // CSS pixels
const SCALE = 1.5;
const S = Math.round(SIZE * SCALE);
const out =
  process.argv[2] ??
  new URL("../src/assets/images/texture/leather.webp", import.meta.url)
    .pathname;

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const wrap = (v, n) => ((v % n) + n) % n;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (a, b) => {
  let h = (a * 73856093) ^ (b * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
};

/** Value noise on a lattice of `cells` per side, wrapping at the tile's edge. */
function valueNoise(cells) {
  const grid = Float32Array.from({ length: cells * cells }, rnd);
  const at = (i, j) => grid[wrap(j, cells) * cells + wrap(i, cells)];
  return (x, y) => {
    const fx = (x / S) * cells;
    const fy = (y / S) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = (fx - i) * (fx - i) * (3 - 2 * (fx - i));
    const v = (fy - j) * (fy - j) * (3 - 2 * (fy - j));
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return top + (bottom - top) * v;
  };
}

/**
 * Points at least `gap` apart, on the wrapped tile, in a grid for lookup.
 * nearest(x, y) gives the two closest: [d1, id1, d2, id2, distance to the
 * border between them].
 */
function voronoi(count, gap) {
  const n = Math.max(3, Math.floor(S / Math.max(gap, S / Math.sqrt(count))));
  const cell = S / n;
  const buckets = Array.from({ length: n * n }, () => []);
  const pts = [];
  const near = (x, y, visit) => {
    const ci = Math.floor(x / cell);
    const cj = Math.floor(y / cell);
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++)
        for (const id of buckets[wrap(cj + dj, n) * n + wrap(ci + di, n)]) {
          let dx = pts[id][0] - x;
          let dy = pts[id][1] - y;
          dx -= Math.round(dx / S) * S;
          dy -= Math.round(dy / S) * S;
          visit(id, dx, dy);
        }
  };
  for (let tries = 0; pts.length < count && tries < count * 40; tries++) {
    const x = rnd() * S;
    const y = rnd() * S;
    let ok = true;
    near(x, y, (_, dx, dy) => {
      if (dx * dx + dy * dy < gap * gap) ok = false;
    });
    if (!ok) continue;
    buckets[Math.floor(y / cell) * n + Math.floor(x / cell)].push(pts.length);
    pts.push([x, y]);
  }
  const res = new Float32Array(5);
  return (x, y) => {
    x = wrap(x, S);
    y = wrap(y, S);
    let d1 = Infinity,
      d2 = Infinity,
      i1 = -1,
      i2 = -1,
      x1 = 0,
      y1 = 0,
      x2 = 0,
      y2 = 0;
    near(x, y, (id, dx, dy) => {
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        i2 = i1;
        x2 = x1;
        y2 = y1;
        d1 = d;
        i1 = id;
        x1 = dx;
        y1 = dy;
      } else if (d < d2) {
        d2 = d;
        i2 = id;
        x2 = dx;
        y2 = dy;
      }
    });
    res[0] = Math.sqrt(d1);
    res[1] = i1;
    res[2] = Math.sqrt(d2);
    res[3] = i2;
    res[4] = (d2 - d1) / (2 * Math.hypot(x2 - x1, y2 - y1) || 1);
    return res;
  };
}

const px = SCALE; // one CSS pixel
const plates = voronoi(Math.round((SIZE / 60) ** 2), 34 * px);
const fine = voronoi(Math.round((SIZE / 24) ** 2), 12 * px);
const pebbles = voronoi(Math.round((SIZE / 5.5) ** 2), 3.6 * px);

const warpX = [valueNoise(10), valueNoise(26), valueNoise(60)];
const warpY = [valueNoise(10), valueNoise(26), valueNoise(60)];
const wearNoise = [valueNoise(5), valueNoise(11)];
const widthNoise = valueNoise(14);
const toneNoise = [valueNoise(3), valueNoise(7), valueNoise(17)];
const tooth = valueNoise(Math.round(S / 2.2));
const mottle = valueNoise(Math.round(SIZE / 9));

const height = new Float32Array(S * S);
const crack = new Float32Array(S * S); // how far down a crack, 0 to 1
const tint = new Float32Array(S * S); // plate to plate, and large drifts

for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const k = y * S + x;
    // bend the borders: big lazy bends, then a jagged edge
    const wx =
      x +
      ((warpX[0](x, y) - 0.5) * 30 +
        (warpX[1](x, y) - 0.5) * 20 +
        (warpX[2](x, y) - 0.5) * 6) *
        px;
    const wy =
      y +
      ((warpY[0](x, y) - 0.5) * 30 +
        (warpY[1](x, y) - 0.5) * 20 +
        (warpY[2](x, y) - 0.5) * 6) *
        px;

    const wear = wearNoise[0](x, y) * 0.65 + wearNoise[1](x, y) * 0.35;
    const swell = 0.55 + widthNoise(x, y) * 0.9;

    // the plates
    let p = plates(wx, wy);
    const plate = p[1];
    const edge = hash(Math.min(p[1], p[3]) + 1, Math.max(p[1], p[3]) + 7);
    // a few borders never opened; the rest from a hairline to a split
    const w1 = (edge < 0.07 ? 0 : 0.3 + edge * edge * 1.25) * swell * px;
    const e1 = p[4];
    let c = w1 > 0 ? clamp((w1 - e1) / px + 0.5) : 0;
    // the plate curls up towards its edge, then drops into the crack
    let h = w1 > 0 ? 0.55 * Math.exp(-Math.max(0, e1 - w1) / (5 * px)) : 0;

    // finer cracks, where it is worn
    p = fine(wx + 40, wy + 90);
    const edge2 = hash(Math.min(p[1], p[3]) + 3, Math.max(p[1], p[3]) + 11);
    const worn = smooth(0.42, 0.68, wear);
    const w2 =
      (edge2 < 0.3 ? 0 : 0.2 + (edge2 - 0.3) * 0.8) * swell * worn * px;
    const e2 = p[4];
    const c2 = w2 > 0.05 * px ? clamp((w2 - e2) / px + 0.5) * 0.7 : 0;
    if (w2 > 0.05 * px)
      h += 0.22 * worn * Math.exp(-Math.max(0, e2 - w2) / (2.5 * px));
    c = Math.max(c, c2);

    // grain: pebbles with soft valleys between, and a tooth
    p = pebbles(x + (warpX[2](x, y) - 0.5) * 4, y + (warpY[2](x, y) - 0.5) * 4);
    const valley = smooth(0, 1.8 * px, p[4]);
    h += 0.34 * valley + 0.05 * hash(p[1], 5);
    h += (tooth(x, y) - 0.5) * 0.16;

    height[k] = h - c * 1.1;
    crack[k] = c;
    tint[k] =
      (hash(plate, 3) - 0.5) * 0.22 +
      (toneNoise[0](x, y) - 0.5) * 0.4 +
      (toneNoise[1](x, y) - 0.5) * 0.35 +
      (toneNoise[2](x, y) - 0.5) * 0.2 +
      (mottle(x, y) - 0.5) * 0.12 +
      (valley - 0.7) * 0.1;
  }

// Lit from the top left, and coloured
const dark = [9, 7, 5];
const hide = [27, 20, 14];
const rub = [70, 52, 34]; // where a raised edge has worn through to tan
const rgb = Buffer.alloc(S * S * 3);
const r = Math.max(1, Math.round(px * 0.75));
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const k = y * S + x;
    const a = height[wrap(y - r, S) * S + wrap(x - r, S)];
    const b = height[wrap(y + r, S) * S + wrap(x + r, S)];
    const light = clamp((height[k] - a) * 0.6 + (height[k] - b) * -0.6, -1, 1);
    const t = clamp(0.5 + tint[k]);
    const c = crack[k];
    for (let ch = 0; ch < 3; ch++) {
      let v = dark[ch] + (hide[ch] - dark[ch]) * t;
      v *= 1 + light * 1.5;
      v += Math.max(0, light) * (rub[ch] - v) * 0.3;
      v *= 1 - c * 0.8;
      rgb[k * 3 + ch] = Math.round(clamp(v, 0, 255));
    }
  }

// Quality 80 keeps the pebbled grain and is 62 KB; 90 was 135 KB, which on a
// phone's slow connection held up home's logo. Below 80 the grain smears.
const info = await sharp(rgb, { raw: { width: S, height: S, channels: 3 } })
  .webp({ quality: 80, effort: 6, smartSubsample: true })
  .toFile(out);
console.log(`${out}: ${S}px, ${(info.size / 1024).toFixed(0)} KB`);
