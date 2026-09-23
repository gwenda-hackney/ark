const HERO_ASPECT = 16 / 10;

/**
 * 16×10 card inside a stored crop, in source pixels.
 * The site used to take that crop and fit=crop it again, which cut the card.
 */
export function cardFramePixels(crop, dimensions, hotspot, aspect = HERO_ASPECT) {
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

export function resolveHeroUrl(row, { width = 1600, height = 1000 } = {}) {
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

export function resolveSeriesHeroUrl(row, { width = 1600, height = 1000 } = {}) {
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
