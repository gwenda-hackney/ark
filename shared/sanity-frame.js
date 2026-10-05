/**
 * Frames of a fixed shape inside a Sanity image, in source pixels, for the
 * CDN's `rect=x,y,w,h` parameter. Pure maths, no I/O: the website's 4:5 card
 * trial uses it, and ops can reuse it for Instagram's 1080×1350 feed image.
 */

/** Instagram feed portrait, also the What's on card trial. */
export const PORTRAIT_ASPECT = 4 / 5;

/** { width, height } from a Sanity CDN filename ("…-1600x2000.jpg"), or null. */
export function sourceSizeFromUrl(url) {
  const match = /-(\d+)x(\d+)\.[a-z0-9]+(?:[?#]|$)/i.exec(String(url ?? ""));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** { x, y, w, h } from a `rect` parameter ("10,20,300,400"), or null. */
export function parseRect(value) {
  const parts = String(value ?? "")
    .split(",")
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * The frame of `aspect` (width / height) inside a `source` of
 * { width, height }, as whole pixels { x, y, w, h }.
 *
 * - `around` ({ x, y, w, h }, e.g. a stored crop): the frame keeps its height
 *   and centre, so a 16×10 crop becomes the 4:5 slice through its middle.
 * - Otherwise the frame is as large as the source allows.
 * - `focus` ({ x, y }, 0–1 of the source, e.g. a hotspot) moves the centre.
 * The frame is narrowed if it would be wider than the source, then slid back
 * inside it. null when the source size is unknown.
 */
export function aspectFrame(
  source,
  aspect,
  { around = null, focus = null } = {},
) {
  const sourceW = Number(source?.width) || 0;
  const sourceH = Number(source?.height) || 0;
  if (sourceW < 1 || sourceH < 1 || !(aspect > 0)) return null;
  const box = around || { x: 0, y: 0, w: sourceW, h: sourceH };
  let h = Math.min(box.h, sourceH);
  let w = h * aspect;
  if (w > sourceW) {
    w = sourceW;
    h = w / aspect;
  }
  const fx = Number(focus?.x);
  const fy = Number(focus?.y);
  const cx = Number.isFinite(fx)
    ? clamp(fx, 0, 1) * sourceW
    : box.x + box.w / 2;
  const cy = Number.isFinite(fy)
    ? clamp(fy, 0, 1) * sourceH
    : box.y + box.h / 2;
  const rw = clamp(Math.round(w), 1, sourceW);
  const rh = clamp(Math.round(h), 1, sourceH);
  return {
    x: Math.round(clamp(cx - rw / 2, 0, sourceW - rw)),
    y: Math.round(clamp(cy - rh / 2, 0, sourceH - rh)),
    w: rw,
    h: rh,
  };
}
