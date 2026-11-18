/**
 * Pictures in an email (shared/email/shell.js's look): one size per picture,
 * as an email has no choice of sizes, at an address every inbox can load.
 * The weekly email's night cards and a one-off email's Image section both
 * come through here.
 */
import { sizedImageUrl } from "../../marketing/web/functions/_lib/sanity-image-url.js";
import { COLOURS, FONTS, esc } from "./shell.js";

/**
 * A picture at the size the email shows it (twice over, for sharp screens):
 * a flyer whole, at its own shape; a photo cut to 4:5 around its focal
 * point, as the website frames it. Always a JPEG unless the app asks for
 * better, with white behind anything see-through.
 * @param {{ url?: string, whole?: boolean } | null | undefined} photo
 * @param {number} shownWidth
 */
export function emailImageUrl(photo, shownWidth) {
  if (!photo?.url) return "";
  let url;
  try {
    url = new URL(photo.url);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.hostname !== "cdn.sanity.io") return url.toString();
  // One size, as an email has no choice of them; never wider than the picture.
  url = new URL(sizedImageUrl(url.toString(), Math.min(1200, Math.round(shownWidth * 2)), { quality: 80 }));
  const width = Number(url.searchParams.get("w"));
  if (!photo.whole) {
    url.searchParams.set("h", String(Math.round(width * 1.25)));
    url.searchParams.set("fit", "crop");
    if (url.searchParams.has("fp-x")) url.searchParams.set("crop", "focalpoint");
  } else {
    url.searchParams.delete("fp-x");
    url.searchParams.delete("fp-y");
  }
  url.searchParams.set("fm", "jpg");
  url.searchParams.set("bg", "ffffff");
  return url.toString();
}

/**
 * The <img> for a picture, or "" when it has no address. `fluid` shrinks it
 * with the column on a phone; otherwise it keeps its width where it fits.
 */
export function emailPicture(photo, shownWidth, { fluid = false, className = "" } = {}) {
  const src = emailImageUrl(photo, shownWidth);
  if (!src) return "";
  const size = fluid ? `width:100%;max-width:${shownWidth}px;` : `width:${shownWidth}px;max-width:100%;`;
  return `<img src="${esc(src)}" width="${shownWidth}" alt="${esc(photo.alt || "")}"${className ? ` class="${className}"` : ""} style="display:block;${size}height:auto;border:0;outline:none;text-decoration:none;border-radius:4px;color:${COLOURS.cream};font-family:${FONTS.slab};font-size:14px;line-height:1.3;">`;
}
