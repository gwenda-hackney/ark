/**
 * Draws the dry cracked leather tile behind every Chart page (#240).
 *
 * Two layers of cracks, as leather crazes: wide plates split by the main
 * cracks, and finer cracks inside them (both from the distance between a
 * point's nearest and second-nearest cell seed, so the cracks join up into
 * a network). The coordinates are warped so the cracks wander. Each plate
 * domes a little and catches the light from the top left, so a crack has a
 * dark floor and a faint lit lip. Over that, worn patches and a fine grain,
 * in warm brown-black. Everything wraps, so the tile repeats without a
 * seam. Seeded, so it comes out the same.
 *
 *   node scripts/write-leather-texture.mjs
 */
import sharp from "sharp";

const S = 900;
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Value noise on a lattice of `cells` per side that wraps at S. */
function valueNoise(cells) {
  const grid = Array.from({ length: cells * cells }, rnd);
  const at = (i, j) =>
    grid[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / S) * cells;
    const fy = (y / S) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fade(fx - i);
    const v = fade(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}

/**
 * F2 - F1 of wrapped cell noise on an nx by ny grid of seeds: ~0 on a
 * crack. More rows than columns makes plates wider than tall, as hide
 * cracks along its stretch.
 */
function crackField(nx, ny, warp) {
  const cw = S / nx;
  const ch = S / ny;
  const seeds = Array.from({ length: nx * ny }, (_, k) => [
    ((k % nx) + rnd()) * cw,
    (Math.floor(k / nx) + rnd()) * ch,
  ]);
  const field = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const [wx, wy] = warp(x, y);
      const ci = Math.floor(wx / cw);
      const cj = Math.floor(wy / ch);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const i = (((ci + di) % nx) + nx) % nx;
          const j = (((cj + dj) % ny) + ny) % ny;
          const [sx, sy] = seeds[j * nx + i];
          let dx = Math.abs(sx - wx);
          let dy = Math.abs(sy - wy);
          if (dx > S / 2) dx = S - dx;
          if (dy > S / 2) dy = S - dy;
          const d = Math.hypot(dx, dy);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      field[y * S + x] = f2 - f1;
    }
  }
  return field;
}

const wrap = (v) => ((v % S) + S) % S;
const warpX = valueNoise(12);
const warpY = valueNoise(12);
const jitterX = valueNoise(60);
const jitterY = valueNoise(60);
const warp = (amount, jitter) => (x, y) => [
  wrap(x + (warpX(x, y) - 0.5) * amount + (jitterX(x, y) - 0.5) * jitter),
  wrap(y + (warpY(x, y) - 0.5) * amount + (jitterY(x, y) - 0.5) * jitter),
];

const major = crackField(9, 15, warp(34, 5));
const minor = crackField(22, 34, warp(22, 3));
const wear = valueNoise(5);
const wearFine = valueNoise(18);

const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const idx = (x, y) => wrap(y) * S + wrap(x);

const out = Buffer.alloc(S * S * 3);
const base = [13, 11, 8];
const warm = [1, 0.84, 0.64];
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const e1 = major[idx(x, y)];
    const e2 = minor[idx(x, y)];
    // Light from the top left: brighter where the surface rises towards it
    const lip1 = Math.max(0, e1 - major[idx(x - 1, y - 1)]);
    const lip2 = Math.max(0, e2 - minor[idx(x - 1, y - 1)]);
    const crack1 = 1 - smooth(0, 2.4, e1);
    const crack2 = 1 - smooth(0, 1.4, e2);
    const dome = smooth(0, 22, e1) * 0.6 + smooth(0, 9, e2) * 0.4;
    const worn = (wear(x, y) - 0.5) * 2 + (wearFine(x, y) - 0.5) * 0.8;
    const grain = (rnd() - 0.5) * 2.5;
    // The hide's pores: a scatter of tiny dark points
    const pore = rnd() < 0.018 ? 4 : 0;
    const lift =
      dome * 2.5 +
      Math.min(1, lip1) * 5 +
      Math.min(1, lip2) * 2 -
      crack1 * 9 -
      crack2 * 3.5 * (1 - crack1) +
      worn * 3 +
      grain -
      pore;
    for (let c = 0; c < 3; c++) {
      const v = base[c] + lift * warm[c];
      out[(y * S + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
}

await sharp(out, { raw: { width: S, height: S, channels: 3 } })
  .webp({ quality: 90 })
  .toFile(
    new URL("../src/assets/images/texture/leather.webp", import.meta.url)
      .pathname,
  );
