/**
 * Build a Sanity CDN URL for series heroes.
 * Without an edge crop, deliver the full image (site uses object-fit:contain).
 * With a crop, request a 16×10 fit=crop frame.
 */
export function sanityCroppedUrl(
  assetUrl,
  crop,
  dimensions,
  { width = 1600, height = 1000, quality = 86 } = {},
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
  const sourceW = Number(dimensions?.width) || 0;
  const sourceH = Number(dimensions?.height) || 0;
  const hasCrop = left > 0 || top > 0 || right > 0 || bottom > 0;
  if (hasCrop && sourceW > 0 && sourceH > 0) {
    const x = Math.max(0, Math.round(left * sourceW));
    const y = Math.max(0, Math.round(top * sourceH));
    const rw = Math.max(1, Math.round(sourceW * (1 - left - right)));
    const rh = Math.max(1, Math.round(sourceH * (1 - top - bottom)));
    url.searchParams.set("rect", `${x},${y},${rw},${rh}`);
    if (height) url.searchParams.set("h", String(height));
    url.searchParams.set("fit", "crop");
  }
  if (width) url.searchParams.set("w", String(width));
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
  });
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
    { width, height },
  );
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
