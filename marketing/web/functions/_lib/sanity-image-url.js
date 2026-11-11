const HERO_ASPECT = 16 / 10;

/**
 * "Show whole image" heroes (#27) travel as their URL with this fragment, so
 * every card path that already passes the hero URL along knows to draw the
 * photo uncropped on a blurred copy of itself. Browsers and the Sanity CDN
 * ignore fragments; add query parameters before it (withImageParams).
 */
const WHOLE_FIT = "#whole";

/** The hero URL, marked when its fit is "whole". */
export function markWholeFit(url, fit) {
  const value = String(url ?? "").trim();
  if (!value || fit !== "whole" || value.endsWith(WHOLE_FIT)) return value;
  return `${value}${WHOLE_FIT}`;
}

export function isWholeFit(url) {
  return String(url ?? "")
    .trim()
    .endsWith(WHOLE_FIT);
}

/** `url` with `params` ("w=960&auto=format") added before any fragment. */
export function withImageParams(url, params) {
  const value = String(url ?? "").trim();
  if (!value) return "";
  const hashAt = value.indexOf("#");
  const base = hashAt < 0 ? value : value.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : value.slice(hashAt);
  return `${base}${base.includes("?") ? "&" : "?"}${params}${hash}`;
}

/**
 * The widths the site asks the image CDN for: a short ladder, so the few
 * sizes of a picture serve every place it shows and the CDN's cache is
 * reused. A picture narrower than a step tops the ladder at its own width.
 * The last is for the widest a flyer is shown (44rem on its own page) on a
 * sharp screen, and for a picture opened large.
 */
export const IMAGE_WIDTHS = [160, 320, 480, 640, 960, 1280, 1600];

/** The most anyone is sent: a flyer or a photo opened large. */
export const IMAGE_LARGEST = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];

/**
 * Flyers carry small type, so the pictures are made small by their size,
 * not by squeezing them: at 75 the faintest type starts to smear.
 */
const IMAGE_QUALITY = 86;

/** The address as a URL when it is a picture on Sanity's image CDN. */
function sanityImage(url) {
  const value = String(url ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.hostname === "cdn.sanity.io" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The most pixels across the CDN has for this picture: its crop (`rect`) or
 * the file (the size in its name, …-1132x1600.jpg), less whatever a frame of
 * another shape (`w` and `h` together) leaves out. Infinity when unknown.
 */
function widestOf(parsed) {
  const rect = (parsed.searchParams.get("rect") || "").split(",").map(Number);
  const named = /-(\d+)x(\d+)\.[a-z0-9]+$/i.exec(parsed.pathname);
  const [width, height] =
    rect.length === 4 && rect[2] > 0 && rect[3] > 0
      ? [rect[2], rect[3]]
      : named
        ? [Number(named[1]), Number(named[2])]
        : [0, 0];
  if (!width || !height) return Infinity;
  const w = Number(parsed.searchParams.get("w")) || 0;
  const h = Number(parsed.searchParams.get("h")) || 0;
  return w && h ? Math.min(width, Math.floor((height * w) / h)) : width;
}

/**
 * A Sanity picture at `width` pixels across, whatever size its address
 * asked for before: the one place the site sets a picture's size. Every
 * place that shows a flyer or a photo asks here for the width it shows.
 *
 * The frame is kept: a crop chosen in ops (`rect`), a focal point and
 * "show whole" (#whole) stay as they are, and a height that came with the
 * width (`h`, a 16×10 card) is scaled with it, so the shape doesn't change.
 * Never wider than the picture itself: the CDN would only stretch it.
 * Anything that isn't on Sanity's CDN (a local image) comes back untouched.
 *
 * @param {string} url
 * @param {number} width
 * @param {{ quality?: number, blur?: number }} [options]
 */
export function sizedImageUrl(
  url,
  width,
  { quality = IMAGE_QUALITY, blur = 0 } = {},
) {
  const parsed = sanityImage(url);
  if (!parsed) return String(url ?? "").trim();
  const params = parsed.searchParams;
  const wanted = Math.max(1, Math.round(Number(width) || 0));
  const sized = Math.max(1, Math.min(wanted, widestOf(parsed)));
  const w = Number(params.get("w")) || 0;
  const h = Number(params.get("h")) || 0;
  if (w && h) params.set("h", String(Math.max(1, Math.round((h * sized) / w))));
  // A height alone only sized it: the width does that now.
  else params.delete("h");
  params.set("w", String(sized));
  params.set("q", String(quality));
  params.set("auto", "format");
  if (blur) params.set("blur", String(blur));
  return parsed.toString();
}

/**
 * The same picture at each width on the ladder, as an <img srcset>: the
 * browser takes the one that fits where it's shown (the img's `sizes`) and
 * the screen. Stops at the picture's own width. "" when it isn't on Sanity's
 * CDN: that image has the one address.
 */
export function imageSrcset(url) {
  const parsed = sanityImage(url);
  if (!parsed) return "";
  const widest = widestOf(parsed);
  // A step just under the picture's own width would be the same download twice.
  const widths = IMAGE_WIDTHS.filter((step) => step < widest * 0.9);
  if (widest <= IMAGE_LARGEST) widths.push(widest);
  return widths
    .map((step) => `${sizedImageUrl(url, step).replace(/#.*$/, "")} ${step}w`)
    .join(", ");
}

/**
 * A tiny, blurred copy of a Sanity photo (a few hundred bytes) to show while
 * the real one loads. "" for anything that isn't a Sanity image.
 */
export function tinyImageUrl(url) {
  return sanityImage(url)
    ? sizedImageUrl(url, 48, { quality: 30, blur: 30 })
    : "";
}

/**
 * 16×10 card inside a stored crop, in source pixels.
 * The site used to take that crop and fit=crop it again, which cut the card.
 */
export function cardFramePixels(
  crop,
  dimensions,
  hotspot,
  aspect = HERO_ASPECT,
) {
  const sourceW = Number(dimensions?.width) || 0;
  const sourceH = Number(dimensions?.height) || 0;
  if (sourceW < 1 || sourceH < 1) return null;
  const left = Number(crop?.left) || 0;
  const top = Number(crop?.top) || 0;
  const right = Number(crop?.right) || 0;
  const bottom = Number(crop?.bottom) || 0;
  const storedW = Math.max(1, sourceW * (1 - left - right));
  const storedH = Math.max(1, sourceH * (1 - top - bottom));
  const frameW = storedW / storedH > aspect ? storedH * aspect : storedW;
  const frameH = frameW / aspect;
  const cx = Number.isFinite(Number(hotspot?.x))
    ? Number(hotspot.x) * sourceW
    : left * sourceW + storedW / 2;
  const cy = Number.isFinite(Number(hotspot?.y))
    ? Number(hotspot.y) * sourceH
    : top * sourceH + storedH / 2;
  const minX = left * sourceW;
  const minY = top * sourceH;
  let x = Math.min(Math.max(minX, cx - frameW / 2), minX + storedW - frameW);
  let y = Math.min(Math.max(minY, cy - frameH / 2), minY + storedH - frameH);
  x = Math.min(Math.max(0, x), sourceW - frameW);
  y = Math.min(Math.max(0, y), sourceH - frameH);
  const rw = Math.max(1, Math.round(frameW));
  const rh = Math.max(1, Math.round(rw / aspect));
  const rx = Math.max(0, Math.min(sourceW - rw, Math.round(x)));
  const ry = Math.max(0, Math.min(sourceH - rh, Math.round(y)));
  return { x: rx, y: ry, w: rw, h: rh };
}

/**
 * Build a Sanity CDN URL for series heroes.
 * Without an edge crop, deliver the full image (the card uses object-fit:cover).
 * With a crop, deliver the 16×10 card itself, with no second crop.
 *
 * The width here is only the most anyone is sent (the flyer opened large):
 * each place that shows the picture asks for its own width (sizedImageUrl).
 */
export function sanityCroppedUrl(
  assetUrl,
  crop,
  dimensions,
  { width = 1600, height = 1000, quality = 86, hotspot = null } = {},
) {
  const raw = String(assetUrl || "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const left = Number(crop?.left) || 0;
  const top = Number(crop?.top) || 0;
  const right = Number(crop?.right) || 0;
  const bottom = Number(crop?.bottom) || 0;
  const hasCrop = left > 0 || top > 0 || right > 0 || bottom > 0;
  const frame = hasCrop ? cardFramePixels(crop, dimensions, hotspot) : null;
  if (frame) {
    url.searchParams.set("rect", `${frame.x},${frame.y},${frame.w},${frame.h}`);
    url.searchParams.set("w", String(width));
    if (height) url.searchParams.set("h", String(height));
    url.searchParams.set("fit", "max");
  } else if (width) {
    url.searchParams.set("w", String(width));
  }
  url.searchParams.set("auto", "format");
  url.searchParams.set("q", String(quality));
  return url.toString();
}

export function objectPositionFromHotspot(hotspot, crop) {
  if (!hotspot || typeof hotspot !== "object") {
    return crop ? "50% 55%" : null;
  }
  const x = Number(hotspot.x);
  const y = Number(hotspot.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "50% 55%";
  return `${(Math.min(1, Math.max(0, x)) * 100).toFixed(1)}% ${(Math.min(1, Math.max(0, y)) * 100).toFixed(1)}%`;
}

export function resolveHeroUrl(row, options = {}) {
  const url = resolveHeroUrlUnmarked(row, options);
  return url ? markWholeFit(url, row?.heroFit) : url;
}

function resolveHeroUrlUnmarked(row, { width = 1600, height = 1000 } = {}) {
  const asset = String(row?.heroAssetUrl || row?.heroImageUrl || "").trim();
  if (!asset) return null;
  const url = sanityCroppedUrl(asset, row?.heroCrop, row?.heroDimensions, {
    width,
    height,
    hotspot: row?.heroHotspot,
  });
  if (url && /[?&]rect=/.test(url)) return url;
  return withFocalPoint(url, row?.heroHotspot) || asset;
}

export function resolveSeriesHeroUrl(row, options = {}) {
  const url = resolveSeriesHeroUrlUnmarked(row, options);
  return url ? markWholeFit(url, row?.seriesHeroFit) : url;
}

function resolveSeriesHeroUrlUnmarked(
  row,
  { width = 1600, height = 1000 } = {},
) {
  const asset = String(
    row?.seriesHeroAssetUrl || row?.seriesHeroImageUrl || "",
  ).trim();
  if (!asset) return null;
  const url = sanityCroppedUrl(
    asset,
    row?.seriesHeroCrop,
    row?.seriesHeroDimensions,
    { width, height, hotspot: row?.seriesHeroHotspot },
  );
  if (url && /[?&]rect=/.test(url)) return url;
  return withFocalPoint(url, row?.seriesHeroHotspot) || asset;
}

function withFocalPoint(url, hotspot) {
  if (!url || !hotspot) return url;
  const x = Number(hotspot.x);
  const y = Number(hotspot.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("fp-x", String(Math.min(1, Math.max(0, x))));
    parsed.searchParams.set("fp-y", String(Math.min(1, Math.max(0, y))));
    return parsed.toString();
  } catch {
    return url;
  }
}
