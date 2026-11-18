/**
 * A pop-up kitchen's own colour on the website (#319). Ops keeps one per
 * kitchen ("#0f4d32", Chez Pickle's green); the site uses it two ways:
 *
 * - as text (its name on home's Food board, its heading on /kitchen), made
 *   just light enough to read on our dark boards: lightened in OKLCH, so it
 *   stays the same hue, until it has at least 4.5:1 contrast (WCAG AA);
 * - as a fill (its card's "Tonight" / "Thursday" tag), the exact colour,
 *   with cream text on it (or our dark ink, for a colour too light for it).
 *
 * A kitchen with no colour has none of this, and the CSS falls back to our
 * red accent. Ops' Images tab shows the same preview from these rules.
 */

/** The dark surfaces a kitchen's name sits on: the page, the boards, the tiles. */
export const BOARDS = ["#0b0a08", "#1a1510", "#27211a"];
/** Our cream (--ch-cream) and our dark board (--ch-board), for text on a fill. */
const CREAM = "#f2e8d2";
const DARK = "#1a1510";
/** WCAG AA for body text. */
export const READABLE = 4.5;

/** "#0f4d32" → [r, g, b] 0–1; null for anything that isn't a colour. */
function rgbOf(hex) {
  const raw = String(hex ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "");
  const full = /^[0-9a-f]{3}$/.test(raw)
    ? [...raw].map((c) => c + c).join("")
    : raw;
  if (!/^[0-9a-f]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

function hexOf(rgb) {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** A clean "#rrggbb", or "" for anything that isn't a colour. */
export function cleanColour(hex) {
  const rgb = rgbOf(hex);
  return rgb ? hexOf(rgb) : "";
}

const toLinear = (v) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toGamma = (v) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

/** WCAG relative luminance. */
function luminance(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast between two colours, 1–21. */
export function contrast(a, b) {
  const [la, lb] = [rgbOf(a), rgbOf(b)].map(luminance);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB → OKLCH [L, C, h]. */
function oklch(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH → sRGB, or null when it falls outside what a screen shows. */
function srgb([L, C, h]) {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma);
  return rgb.every((v) => v >= -0.0005 && v <= 1.0005) ? rgb : null;
}

/** The same hue at lightness L, its chroma eased off only as far as a screen needs. */
function atLightness([, C, h], L) {
  for (let chroma = C; chroma >= 0; chroma -= 0.005) {
    const rgb = srgb([L, chroma, h]);
    if (rgb) return rgb;
  }
  return srgb([L, 0, h]) || [L, L, L];
}

/**
 * The colour as text on the boards: itself when it already reads at 4.5:1
 * on every one of them, else the same hue lightened just enough. "" for
 * no colour.
 *
 * @param {string} hex "#0f4d32"
 * @param {string[]} [boards] the surfaces it sits on
 */
export function readableOn(hex, boards = BOARDS) {
  const rgb = rgbOf(hex);
  if (!rgb) return "";
  const reads = (candidate) =>
    boards.every((board) => contrast(candidate, board) >= READABLE);
  if (reads(hexOf(rgb))) return hexOf(rgb);
  const lch = oklch(rgb);
  for (let L = lch[0]; L <= 1; L += 0.005) {
    const candidate = hexOf(atLightness(lch, L));
    if (reads(candidate)) return candidate;
  }
  return CREAM;
}

/**
 * Everything the page needs for a kitchen's colour, as CSS custom
 * properties for its element's `style`: `--kitchen-ink` (text),
 * `--kitchen-fill` (the exact colour) and `--kitchen-on-fill` (text on it).
 * "" when it has none, so the CSS falls back to our red.
 */
export function kitchenColourStyle(hex) {
  const fill = cleanColour(hex);
  if (!fill) return "";
  const onFill = contrast(CREAM, fill) >= READABLE ? CREAM : DARK;
  return `--kitchen-ink: ${readableOn(fill)}; --kitchen-fill: ${fill}; --kitchen-on-fill: ${onFill}`;
}
